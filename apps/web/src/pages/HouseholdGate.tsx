import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listHouseholds,
  createHousehold,
  createUser,
  getHousehold,
} from "../api/households";
import { useHousehold } from "../context/HouseholdContext";

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

export function HouseholdGate() {
  const { selectHousehold } = useHousehold();
  const queryClient = useQueryClient();
  const [createName, setCreateName] = useState("");
  const [newUserNickname, setNewUserNickname] = useState("");
  const [newUserAliases, setNewUserAliases] = useState<string[]>([]);
  const [newUserAliasInput, setNewUserAliasInput] = useState("");
  const [newUserColor, setNewUserColor] = useState(PRESET_COLORS[0]);
  const [pendingHouseholdId, setPendingHouseholdId] = useState<string | null>(null);

  const { data: households = [], isLoading } = useQuery({
    queryKey: ["households"],
    queryFn: listHouseholds,
  });

  const createHouseholdMutation = useMutation({
    mutationFn: createHousehold,
    onSuccess: (household) => {
      setPendingHouseholdId(household.id);
      setCreateName("");
    },
  });

  const createUserMutation = useMutation({
    mutationFn: ({ hid, data }: { hid: string; data: Parameters<typeof createUser>[1] }) =>
      createUser(hid, data),
    onSuccess: async (_, { hid }) => {
      const data = await getHousehold(hid);
      if (data.users.length > 0) {
        await selectHousehold(hid);
        setPendingHouseholdId(null);
        setNewUserNickname("");
        setNewUserAliases([]);
        setNewUserAliasInput("");
        setNewUserColor(PRESET_COLORS[0]);
      }
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });

  const handleCreateHousehold = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    createHouseholdMutation.mutate({ name: createName.trim() });
  };

  const handleAddFirstUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingHouseholdId || !newUserNickname.trim() || newUserAliases.length === 0) return;
    createUserMutation.mutate({
      hid: pendingHouseholdId,
      data: {
        nickname: newUserNickname.trim(),
        nameAliases: newUserAliases,
        color: newUserColor,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <h1 className="text-2xl font-semibold text-slate-800 text-center">
          Couple Finance
        </h1>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-medium text-slate-700 mb-4">
            Select existing household
          </h2>
          {isLoading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : households.length === 0 ? (
            <p className="text-slate-500 text-sm">No households yet. Create one below.</p>
          ) : (
            <div className="space-y-2">
              {households.map((h) => (
                <button
                  key={h.id}
                  onClick={() => selectHousehold(h.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="font-medium text-slate-800">{h.name}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    ({h.userCount} user{h.userCount !== 1 ? "s" : ""})
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-medium text-slate-700 mb-4">
            Create new household
          </h2>
          {pendingHouseholdId ? (
            <form onSubmit={handleAddFirstUser} className="space-y-4">
              <p className="text-sm text-slate-600">
                Add the first user to your household:
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nickname
                </label>
                <input
                  type="text"
                  value={newUserNickname}
                  onChange={(e) => setNewUserNickname(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                  placeholder="e.g. Nick"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name aliases (for transfer matching)
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Add full names as they appear on bank statements
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newUserAliasInput}
                    onChange={(e) => setNewUserAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = newUserAliasInput.trim();
                        if (v && !newUserAliases.includes(v))
                          setNewUserAliases([...newUserAliases, v]);
                        setNewUserAliasInput("");
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                    placeholder="e.g. NIKOLAOS PAPADOPOULOS"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = newUserAliasInput.trim();
                      if (v && !newUserAliases.includes(v))
                        setNewUserAliases([...newUserAliases, v]);
                      setNewUserAliasInput("");
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
                  >
                    Add
                  </button>
                </div>
                {newUserAliases.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {newUserAliases.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-sm"
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() =>
                            setNewUserAliases(newUserAliases.filter((x) => x !== a))
                          }
                          className="text-slate-500 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {newUserAliases.length === 0 && (
                  <p className="text-xs text-amber-600">At least one alias required</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewUserColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newUserColor === c
                          ? "border-slate-800 scale-110"
                          : "border-transparent hover:border-slate-400"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={createUserMutation.isPending || newUserAliases.length === 0}
                className="w-full py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {createUserMutation.isPending ? "Adding..." : "Add user & continue"}
              </button>
              {createUserMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createUserMutation.error as Error).message}
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleCreateHousehold} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Household name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
                  placeholder="e.g. Papadopoulos Family"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={createHouseholdMutation.isPending}
                className="w-full py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {createHouseholdMutation.isPending ? "Creating..." : "Create household"}
              </button>
              {createHouseholdMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createHouseholdMutation.error as Error).message}
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
