import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getSavingsSuggestion,
  type SavingsGoal,
} from "../api/goals";
import { Plus, Trash2 } from "lucide-react";

export function Goals() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate, setTargetDate] = useState("");

  const { data: goals = [] } = useQuery({
    queryKey: ["goals"],
    queryFn: listGoals,
  });

  const create = useMutation({
    mutationFn: () =>
      createGoal({
        name,
        targetAmount: parseFloat(targetAmount) || 0,
        currentAmount: parseFloat(currentAmount) || 0,
        targetDate: targetDate || new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setShowForm(false);
      setName("");
      setTargetAmount("");
      setCurrentAmount("0");
      setTargetDate("");
    },
  });

  const remove = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Savings Goals</h1>

      <div className="mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
        >
          <Plus className="w-4 h-4" />
          Add goal
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer trip"
                className="w-full rounded border border-slate-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target amount (€)</label>
              <input
                type="number"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current amount (€)</label>
              <input
                type="number"
                step="0.01"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
                required
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onUpdate={() => qc.invalidateQueries({ queryKey: ["goals"] })}
            onDelete={() => remove.mutate(goal.id)}
          />
        ))}
      </div>

      {goals.length === 0 && !showForm && (
        <p className="text-slate-500 text-center py-12">No goals yet. Add one to start tracking.</p>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  onUpdate,
  onDelete,
}: {
  goal: SavingsGoal;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const { data: suggestion } = useQuery({
    queryKey: ["savings-suggestion", goal.id],
    queryFn: () => getSavingsSuggestion(goal.id),
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(goal.name);
  const [targetAmount, setTargetAmount] = useState(String(goal.targetAmount));
  const [currentAmount, setCurrentAmount] = useState(String(goal.currentAmount));
  const [targetDate, setTargetDate] = useState(goal.targetDate);
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () =>
      updateGoal(goal.id, {
        name,
        targetAmount: parseFloat(targetAmount) || 0,
        currentAmount: parseFloat(currentAmount) || 0,
        targetDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["savings-suggestion", goal.id] });
      setEditing(false);
      onUpdate();
    },
  });

  const progress = goal.targetAmount > 0 ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <div className="flex justify-between items-start">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
            className="flex-1 space-y-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border px-2 py-1"
            />
            <div className="flex gap-2 flex-wrap">
              <input
                type="number"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="Target"
                className="rounded border px-2 py-1 w-24"
              />
              <input
                type="number"
                step="0.01"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="Current"
                className="rounded border px-2 py-1 w-24"
              />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </div>
            <button type="submit" className="text-sm text-slate-600 hover:text-slate-800">
              Save
            </button>
          </form>
        ) : (
          <div>
            <h3 className="font-medium text-slate-800">{goal.name}</h3>
            <p className="text-sm text-slate-600">
              €{Number(goal.currentAmount).toFixed(2)} / €{Number(goal.targetAmount).toFixed(2)} by {goal.targetDate}
            </p>
            {suggestion && suggestion.monthlyTarget > 0 && (
              <p className="text-sm text-slate-500 mt-1">
                Save €{suggestion.monthlyTarget.toFixed(2)}/month to reach your goal
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-slate-600 hover:text-slate-800"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button onClick={onDelete} className="text-red-600 hover:text-red-700">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-600 rounded-full transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}
