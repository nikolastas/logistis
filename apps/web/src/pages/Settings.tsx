import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHousehold } from "../context/HouseholdContext";
import {
  updateHousehold,
  deleteHousehold,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserOrphanedCount,
  listIncome,
  createIncome,
  updateIncome,
  deleteIncome,
  getHouseholdIncomeSummary,
  getDefaultSplit,
} from "../api/households";
import type { User, Income, PerkCard } from "@couple-finance/shared";
import { getCategories } from "../api/insights";
import { Settings as SettingsIcon, Users, Wallet, Home, Plus, Trash2, Pencil } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

type Tab = "household" | "users" | "income";

function DefaultSplitSection({
  householdId,
  users,
  initialSplit,
  onRefresh,
}: {
  householdId: string;
  users: User[];
  initialSplit?: Record<string, number>;
  onRefresh: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: computedSplit } = useQuery({
    queryKey: ["default-split", householdId],
    queryFn: () => getDefaultSplit(householdId),
    enabled: users.length > 0 && !initialSplit,
  });
  const effectiveInitial = initialSplit ?? computedSplit;
  const equalShare = 1 / users.length;
  const [shares, setShares] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const u of users) {
      out[u.id] = effectiveInitial?.[u.id] ?? equalShare;
    }
    return out;
  });

  useEffect(() => {
    if (effectiveInitial && users.length > 0) {
      const out: Record<string, number> = {};
      for (const u of users) {
        out[u.id] = effectiveInitial[u.id] ?? equalShare;
      }
      setShares(out);
    }
  }, [effectiveInitial, users, equalShare]);

  const total = Object.values(shares).reduce((s, v) => s + v, 0);
  const isValid = Math.abs(total - 1) < 0.001;

  const update = useMutation({
    mutationFn: () => {
      const normalized: Record<string, number> = {};
      const sum = Object.values(shares).reduce((a, b) => a + b, 0);
      for (const [uid, v] of Object.entries(shares)) {
        normalized[uid] = sum > 0 ? v / sum : 1 / users.length;
      }
      return updateHousehold(householdId, { defaultSplit: normalized });
    },
    onSuccess: async () => {
      await onRefresh();
      qc.invalidateQueries({ queryKey: ["households"] });
    },
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-700 mb-2">Default split (shared expenses)</h3>
      <p className="text-slate-500 text-xs mb-3">
        Used when uploading transactions as &quot;Shared (split by default)&quot;. When no custom
        split is saved, defaults to each person&apos;s net salary / household total. Percentages
        must sum to 100%.
      </p>
      <div className="space-y-2 mb-3">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full shrink-0"
              style={{ backgroundColor: u.color }}
            />
            <span className="text-sm text-slate-700 flex-1">{u.nickname}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round((shares[u.id] ?? 0) * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setShares((prev) => ({ ...prev, [u.id]: Math.max(0, Math.min(1, v || 0)) }));
              }}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-right"
            />
            <span className="text-slate-500 text-sm">%</span>
          </div>
        ))}
      </div>
      <p className={`text-xs mb-2 ${isValid ? "text-slate-500" : "text-amber-600"}`}>
        Total: {Math.round(total * 100)}%
      </p>
      <button
        onClick={() => update.mutate()}
        disabled={!isValid || update.isPending}
        className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {update.isPending ? "Saving..." : "Save default split"}
      </button>
    </div>
  );
}

export function Settings() {
  const { household, users, clearHousehold, refreshUsers } = useHousehold();
  const [activeTab, setActiveTab] = useState<Tab>("household");

  if (!household) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "household", label: "Household", icon: <Home className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "income", label: "Income", icon: <Wallet className="w-4 h-4" /> },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
        <SettingsIcon className="w-6 h-6" />
        Settings
      </h1>

      <div className="flex gap-2 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-slate-200 text-slate-900"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "household" && (
        <HouseholdTab
          household={household}
          users={users}
          onClear={clearHousehold}
          onRefresh={refreshUsers}
        />
      )}
      {activeTab === "users" && (
        <UsersTab householdId={household.id} onRefresh={refreshUsers} />
      )}
      {activeTab === "income" && <IncomeTab householdId={household.id} users={users} />}
    </div>
  );
}

function HouseholdTab({
  household,
  users,
  onClear,
  onRefresh,
}: {
  household: { id: string; name: string; defaultSplit?: Record<string, number> | null };
  users: User[];
  onClear: () => void;
  onRefresh: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(household.name);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const update = useMutation({
    mutationFn: () => updateHousehold(household.id, { name }),
    onSuccess: async () => {
      await onRefresh();
      qc.invalidateQueries({ queryKey: ["households"] });
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteHousehold(household.id),
    onSuccess: () => {
      onClear();
      qc.invalidateQueries({ queryKey: ["households"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Household name</h3>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
            className="flex gap-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              required
            />
            <button
              type="submit"
              disabled={update.isPending}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(household.name);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-slate-800">{household.name}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-slate-500 hover:text-slate-700"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {users.length > 0 && (
        <DefaultSplitSection
          householdId={household.id}
          users={users}
          initialSplit={household.defaultSplit ?? undefined}
          onRefresh={onRefresh}
        />
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Switch household</h3>
        <button
          onClick={onClear}
          className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          Switch Household
        </button>
      </div>

      <div className="bg-white rounded-lg border border-red-100 p-4 shadow-sm border-red-200">
        <h3 className="text-sm font-medium text-red-800 mb-2">Danger zone</h3>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Delete Household
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete household?</h3>
            <p className="text-slate-600 text-sm mb-4">
              All users and income records will be deleted. Transactions will be orphaned (not
              deleted). This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  remove.mutate();
                  setShowDeleteModal(false);
                }}
                disabled={remove.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {remove.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab({
  householdId,
  onRefresh,
}: {
  householdId: string;
  onRefresh: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", householdId],
    queryFn: () => listUsers(householdId),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ user: User } | null>(null);

  const [addNickname, setAddNickname] = useState("");
  const [addLegalEl, setAddLegalEl] = useState("");
  const [addLegalEn, setAddLegalEn] = useState("");
  const [addColor, setAddColor] = useState(PRESET_COLORS[0]);

  const create = useMutation({
    mutationFn: () =>
      createUser(householdId, {
        nickname: addNickname.trim(),
        legalNameEl: addLegalEl.trim(),
        legalNameEn: addLegalEn.trim(),
        color: addColor,
      }),
    onSuccess: async () => {
      await onRefresh();
      qc.invalidateQueries({ queryKey: ["users", householdId] });
      qc.invalidateQueries({ queryKey: ["households"] });
      setShowAddForm(false);
      setAddNickname("");
      setAddLegalEl("");
      setAddLegalEn("");
      setAddColor(PRESET_COLORS[0]);
    },
  });

  const remove = useMutation({
    mutationFn: (uid: string) => deleteUser(householdId, uid),
    onSuccess: async () => {
      await onRefresh();
      qc.invalidateQueries({ queryKey: ["users", householdId] });
      qc.invalidateQueries({ queryKey: ["households"] });
      setDeleteModal(null);
    },
  });

  if (isLoading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          householdId={householdId}
          onRefresh={onRefresh}
          onEdit={() => setEditingId(editingId === user.id ? null : user.id)}
          isEditing={editingId === user.id}
          onDeleteClick={() => setDeleteModal({ user })}
        />
      ))}

      {showAddForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-4"
        >
          <h3 className="font-medium text-slate-800">Add user</h3>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Nickname</label>
            <input
              value={addNickname}
              onChange={(e) => setAddNickname(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Legal name (Greek)</label>
            <input
              value={addLegalEl}
              onChange={(e) => setAddLegalEl(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Legal name (English)</label>
            <input
              value={addLegalEn}
              onChange={(e) => setAddLegalEn(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    addColor === c ? "border-slate-800" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
          </div>
          {create.isError && (
            <p className="text-sm text-red-600">{(create.error as Error).message}</p>
          )}
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      )}

      {deleteModal && (
        <DeleteUserModal
          user={deleteModal.user}
          householdId={householdId}
          onConfirm={() => remove.mutate(deleteModal.user.id)}
          onCancel={() => setDeleteModal(null)}
          isLoading={remove.isPending}
        />
      )}
    </div>
  );
}

function UserCard({
  user,
  householdId,
  onRefresh,
  onEdit,
  isEditing,
  onDeleteClick,
}: {
  user: User;
  householdId: string;
  onRefresh: () => Promise<void>;
  onEdit: () => void;
  isEditing: boolean;
  onDeleteClick: () => void;
}) {
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(user.nickname);
  const [legalNameEl, setLegalNameEl] = useState(user.legalNameEl);
  const [legalNameEn, setLegalNameEn] = useState(user.legalNameEn);
  const [color, setColor] = useState(user.color);

  const update = useMutation({
    mutationFn: () =>
      updateUser(householdId, user.id, {
        nickname,
        legalNameEl,
        legalNameEn,
        color,
      }),
    onSuccess: async () => {
      await onRefresh();
      qc.invalidateQueries({ queryKey: ["users", householdId] });
      onEdit();
    },
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full shrink-0"
          style={{ backgroundColor: user.color }}
        />
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
            className="flex-1 space-y-2"
          >
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nickname"
              className="w-full rounded border px-2 py-1"
            />
            <input
              value={legalNameEl}
              onChange={(e) => setLegalNameEl(e.target.value)}
              placeholder="Legal name (Greek)"
              className="w-full rounded border px-2 py-1"
            />
            <input
              value={legalNameEn}
              onChange={(e) => setLegalNameEn(e.target.value)}
              placeholder="Legal name (English)"
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2 flex-wrap mt-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    color === c ? "border-slate-800" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                disabled={update.isPending}
                className="text-sm px-3 py-1 bg-slate-700 text-white rounded"
              >
                Save
              </button>
              <button type="button" onClick={onEdit} className="text-sm text-slate-600">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1">
            <p className="font-medium text-slate-800">{user.nickname}</p>
            <p className="text-sm text-slate-600">{user.legalNameEl}</p>
            <p className="text-sm text-slate-600">{user.legalNameEn}</p>
          </div>
        )}
        {!isEditing && (
          <div className="flex gap-2">
            <button onClick={onEdit} className="text-slate-500 hover:text-slate-700">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDeleteClick} className="text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteUserModal({
  user,
  householdId,
  onConfirm,
  onCancel,
  isLoading,
}: {
  user: User;
  householdId: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { data: countData } = useQuery({
    queryKey: ["orphaned-count", householdId, user.id],
    queryFn: () => getUserOrphanedCount(householdId, user.id),
  });
  const orphanedCount = countData?.orphanedTransactionCount ?? 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Remove user?</h3>
        <p className="text-slate-600 text-sm mb-2">
          Removing <strong>{user.nickname}</strong> will delete their income records.
        </p>
        {orphanedCount > 0 && (
          <p className="text-amber-700 text-sm mb-2 font-medium">
            This user has {orphanedCount} tagged transaction{orphanedCount !== 1 ? "s" : ""} which
            will become untagged.
          </p>
        )}
        <p className="text-slate-600 text-sm mb-4">
          This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncomeTab({
  householdId,
  users,
}: {
  householdId: string;
  users: User[];
}) {
  const { data: summary } = useQuery({
    queryKey: ["household-income-summary", householdId],
    queryFn: () => getHouseholdIncomeSummary(householdId),
  });

  if (users.length === 0) {
    return (
      <p className="text-slate-600 py-4">
        Add users in the <strong>Users</strong> tab first to manage income and perk cards.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {users.map((user) => (
        <UserIncomeSection
          key={user.id}
          householdId={householdId}
          user={user}
        />
      ))}

      {summary && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm mt-8">
          <h3 className="font-medium text-slate-800 mb-2">Household Income Summary</h3>
          <p className="text-2xl font-semibold text-slate-800">
            €{summary.total.toFixed(2)} <span className="text-sm font-normal text-slate-600">/ month</span>
          </p>
          {summary.breakdown.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {summary.breakdown.map((b) => (
                <li key={b.userId}>
                  {b.nickname}: €
                  {(b.netMonthlySalary + (b.perkCardsTotal ?? 0)).toFixed(2)}
                  {b.perkCardsTotal != null && b.perkCardsTotal > 0 && (
                    <span className="text-slate-500"> (incl. perks)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function UserIncomeSection({ householdId, user }: { householdId: string; user: User }) {
  const qc = useQueryClient();
  const { data: incomeList = [], isLoading } = useQuery({
    queryKey: ["income", householdId, user.id],
    queryFn: () => listIncome(householdId, user.id),
  });
  const [showForm, setShowForm] = useState(false);
  const [formNet, setFormNet] = useState("");
  const [formGross, setFormGross] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPerkCards, setFormPerkCards] = useState<PerkCard[]>([]);

  const activeIncome = incomeList.find((i) => !i.effectiveTo);
  const activeTotal =
    activeIncome &&
    parseFloat(String(activeIncome.netMonthlySalary)) +
      (activeIncome.perkCards?.reduce((s, p) => s + Number(p.monthlyValue), 0) ?? 0);

  const create = useMutation({
    mutationFn: () =>
      createIncome(householdId, user.id, {
        netMonthlySalary: parseFloat(formNet) || 0,
        grossMonthlySalary: formGross ? parseFloat(formGross) : undefined,
        effectiveFrom: formFrom || new Date().toISOString().slice(0, 10),
        notes: formNotes || undefined,
        perkCards: formPerkCards.length > 0 ? formPerkCards : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income", householdId, user.id] });
      qc.invalidateQueries({ queryKey: ["household-income-summary", householdId] });
      setShowForm(false);
      setFormNet("");
      setFormGross("");
      setFormFrom("");
      setFormNotes("");
      setFormPerkCards([]);
    },
  });

  const remove = useMutation({
    mutationFn: (iid: string) => deleteIncome(householdId, user.id, iid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income", householdId, user.id] });
      qc.invalidateQueries({ queryKey: ["household-income-summary", householdId] });
    },
  });

  if (isLoading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-8 h-8 rounded-full shrink-0"
          style={{ backgroundColor: user.color }}
        />
        <h3 className="font-medium text-slate-800">{user.nickname}</h3>
        {activeIncome && (
          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-sm">
            €{activeTotal?.toFixed(2) ?? parseFloat(String(activeIncome.netMonthlySalary)).toFixed(2)}/mo
            {activeIncome.perkCards && activeIncome.perkCards.length > 0 && (
              <span className="ml-1 text-slate-500">
                (incl. perks)
              </span>
            )}
          </span>
        )}
      </div>

      <div className="space-y-2 mb-4">
        {incomeList.map((inc) => (
          <IncomeRecord
            key={inc.id}
            income={inc}
            householdId={householdId}
            userId={user.id}
            onRefresh={() => {
              qc.invalidateQueries({ queryKey: ["income", householdId, user.id] });
              qc.invalidateQueries({ queryKey: ["household-income-summary", householdId] });
            }}
            onDelete={() => remove.mutate(inc.id)}
          />
        ))}
      </div>

      {showForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="bg-slate-50 rounded-lg p-4 space-y-3 mb-4"
        >
          <div>
            <label className="block text-sm text-slate-600 mb-1">Net monthly (€)</label>
            <input
              type="number"
              step="0.01"
              value={formNet}
              onChange={(e) => setFormNet(e.target.value)}
              className="w-full rounded border px-2 py-1"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Gross monthly (€, optional)</label>
            <input
              type="number"
              step="0.01"
              value={formGross}
              onChange={(e) => setFormGross(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Effective from</label>
            <input
              type="date"
              value={formFrom}
              onChange={(e) => setFormFrom(e.target.value)}
              className="w-full rounded border px-2 py-1"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <PerkCardsEditor value={formPerkCards} onChange={setFormPerkCards} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="px-3 py-1 bg-slate-700 text-white rounded text-sm"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1 border rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 mb-4"
        >
          <Plus className="w-4 h-4" />
          Add Salary Record
        </button>
      )}
    </div>
  );
}

const PERK_CATEGORY_EXCLUDE = new Set(["income", "uncategorized"]);

function PerkCardBadges({ perkCards }: { perkCards: PerkCard[] }) {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {perkCards.map((p, i) => (
        <span
          key={i}
          className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600"
          title={p.categoryId ? `Spent on: ${catMap[p.categoryId] ?? p.categoryId}` : undefined}
        >
          {p.name}: €{Number(p.monthlyValue).toFixed(2)}
          {p.categoryId && (
            <span className="text-slate-500"> ({catMap[p.categoryId]})</span>
          )}
        </span>
      ))}
    </div>
  );
}

function PerkCardsEditor({
  value,
  onChange,
}: {
  value: PerkCard[];
  onChange: (v: PerkCard[]) => void;
}) {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const perkCategories = categories.filter((c) => !PERK_CATEGORY_EXCLUDE.has(c.id));
  const defaultCategoryId = perkCategories[0]?.id ?? "food";

  const add = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange([...value, { name: "", monthlyValue: 0, categoryId: defaultCategoryId }]);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const update = (i: number, field: keyof PerkCard, v: string | number) => {
    const next = [...value];
    next[i] = { ...next[i], [field]: v };
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-700">
          Perk cards (meal vouchers, transport, etc.)
        </label>
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400"
        >
          + Add perk card
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-1">None added yet — click + Add perk card above</p>
      ) : (
        <div className="space-y-2">
          {value.map((p, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <input
                value={p.name}
                onChange={(e) => update(i, "name", e.target.value)}
                placeholder="e.g. Meal vouchers"
                className="min-w-[120px] flex-1 rounded border px-2 py-1 text-sm"
              />
              <select
                value={p.categoryId || defaultCategoryId}
                onChange={(e) => update(i, "categoryId", e.target.value)}
                className="rounded border px-2 py-1 text-sm bg-white min-w-[140px]"
                title="Spent on"
              >
                {perkCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={p.monthlyValue || ""}
                onChange={(e) => update(i, "monthlyValue", parseFloat(e.target.value) || 0)}
                placeholder="€/mo"
                className="w-20 rounded border px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncomeRecord({
  income,
  householdId,
  userId,
  onRefresh,
  onDelete,
}: {
  income: Income;
  householdId: string;
  userId: string;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [net, setNet] = useState(String(parseFloat(String(income.netMonthlySalary))));
  const [gross, setGross] = useState(
    income.grossMonthlySalary != null ? String(income.grossMonthlySalary) : ""
  );
  const [from, setFrom] = useState(income.effectiveFrom);
  const [to, setTo] = useState(income.effectiveTo ?? "");
  const [notes, setNotes] = useState(income.notes ?? "");
  const [perkCards, setPerkCards] = useState<PerkCard[]>(() =>
    (income.perkCards ?? []).map((p) => ({
      name: p.name,
      monthlyValue: p.monthlyValue,
      categoryId: "categoryId" in p && p.categoryId ? p.categoryId : "food",
    }))
  );

  const update = useMutation({
    mutationFn: () =>
      updateIncome(householdId, userId, income.id, {
        netMonthlySalary: parseFloat(net) || 0,
        grossMonthlySalary: gross ? parseFloat(gross) : null,
        effectiveFrom: from,
        effectiveTo: to || null,
        notes: notes || null,
        perkCards: perkCards.length > 0 ? perkCards : null,
      }),
    onSuccess: () => {
      onRefresh();
      setEditing(false);
    },
  });

  const period = income.effectiveTo
    ? `${income.effectiveFrom} → ${income.effectiveTo}`
    : `${income.effectiveFrom} → Present`;

  return (
    <div className="bg-white rounded border border-slate-200 px-3 py-2">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
          className="space-y-4"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="number"
              step="0.01"
              value={net}
              onChange={(e) => setNet(e.target.value)}
              placeholder="Net €"
              className="w-24 rounded border px-2 py-1"
            />
            <input
              type="number"
              step="0.01"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              placeholder="Gross €"
              className="w-24 rounded border px-2 py-1"
            />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border px-2 py-1"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="End date"
              className="rounded border px-2 py-1"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="flex-1 min-w-[100px] rounded border px-2 py-1"
            />
          </div>
          <div className="border-t border-slate-200 pt-3">
            <PerkCardsEditor value={perkCards} onChange={setPerkCards} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={update.isPending}
              className="text-sm px-3 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-600"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <span className="font-medium">
              €{parseFloat(String(income.netMonthlySalary)).toFixed(2)}
              {(income.perkCards?.length ?? 0) > 0 && (
                <span className="text-slate-500 font-normal">
                  {" "}
                  + €
                  {income.perkCards!.reduce((s, p) => s + Number(p.monthlyValue), 0).toFixed(2)}{" "}
                  perks
                </span>
              )}
            </span>
            <span className="text-slate-500 text-sm ml-2">{period}</span>
            {income.notes && (
              <span className="text-slate-500 text-sm ml-2">— {income.notes}</span>
            )}
            {income.perkCards && income.perkCards.length > 0 && (
              <PerkCardBadges perkCards={income.perkCards} />
            )}
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              + Perk cards
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-slate-500 hover:text-slate-700"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="text-red-600 hover:text-red-700" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
