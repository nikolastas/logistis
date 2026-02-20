import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Upload as UploadIcon, X } from "lucide-react";
import { uploadStatement } from "../api/statements";
import type { UploadResponse } from "../api/statements";
import { useHousehold } from "../context/HouseholdContext";

const BANKS = [
  { id: "auto", label: "Auto-detect" },
  { id: "alpha-bank", label: "Alpha Bank" },
  { id: "nbg", label: "NBG (CSV)" },
  { id: "nbg-xlsx", label: "NBG (XLSX)" },
  { id: "winbank", label: "Winbank (Piraeus)" },
  { id: "revolut", label: "Revolut" },
  { id: "generic-pdf", label: "PDF (generic)" },
];

export function Upload() {
  const { household, users } = useHousehold();
  const [bank, setBank] = useState("auto");
  const [ownerId, setOwnerId] = useState<string>("");
  const [drag, setDrag] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const navigate = useNavigate();

  const upload = useMutation({
    mutationFn: ({
      file,
      bankId,
      ownerId: oid,
      householdId: hid,
    }: {
      file: File;
      bankId: string;
      ownerId: string | null;
      householdId: string | null;
    }) =>
      uploadStatement(file, bankId, {
        ownerId: oid || null,
        householdId: hid || null,
      }),
    onSuccess: (data) => setUploadResult(data),
  });

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) upload.mutate({ file, bankId: bank, ownerId: ownerId || null, householdId: household?.id ?? null });
    },
    [bank, ownerId, household?.id, upload]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate({ file, bankId: bank, ownerId: ownerId || null, householdId: household?.id ?? null });
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Upload Statement</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Bank</label>
          <select
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          >
            {BANKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Import as</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          >
            <option value="">Shared (split by income)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nickname}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          drag ? "border-slate-500 bg-slate-100" : "border-slate-300 bg-white"
        }`}
      >
        <UploadIcon className="w-12 h-12 mx-auto text-slate-400 mb-3" />
        <p className="text-slate-600 mb-2">
          Drop your CSV, XLSX or PDF statement here, or click to browse
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
          onChange={onFileChange}
          className="hidden"
          id="file-input"
        />
        <label
          htmlFor="file-input"
          className="inline-block px-4 py-2 bg-slate-700 text-white rounded-lg cursor-pointer hover:bg-slate-600"
        >
          Choose file
        </label>
      </div>

      {upload.isError && (
        <p className="mt-4 text-red-600 text-sm">{String(upload.error)}</p>
      )}
      {upload.isPending && (
        <p className="mt-4 text-slate-600 text-sm">Parsing and categorizing...</p>
      )}

      {uploadResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setUploadResult(null);
            navigate("/review");
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Upload complete</h2>
              <button
                onClick={() => {
                  setUploadResult(null);
                  navigate("/review");
                }}
                className="p-1 text-slate-500 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3 mb-4">
                <p className="text-slate-700">
                  <span className="font-medium text-green-600">{uploadResult.created}</span> transaction
                  {uploadResult.created !== 1 ? "s" : ""} imported
                  {uploadResult.skipped ? (
                    <span className="text-slate-600">
                      {" "}
                      · <span className="font-medium">{uploadResult.skipped}</span> duplicate
                      {uploadResult.skipped !== 1 ? "s" : ""} skipped
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-500">
                  Bank: {uploadResult.bankSource}
                  {uploadResult.ownerId
                    ? ` · Imported as: ${users.find((u) => u.id === uploadResult.ownerId)?.nickname ?? "User"}`
                    : " · Split by income"}
                </p>
              </div>
              {uploadResult.sample.length > 0 && (
                <>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Sample</p>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs text-slate-600">Date</th>
                          <th className="px-3 py-2 text-left text-xs text-slate-600">Description</th>
                          <th className="px-3 py-2 text-right text-xs text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {uploadResult.sample.map((t) => (
                          <tr key={t.id}>
                            <td className="px-3 py-2 text-slate-700">{t.date}</td>
                            <td className="px-3 py-2 text-slate-800 truncate max-w-[200px]">
                              {t.description}
                            </td>
                            <td
                              className={`px-3 py-2 text-right ${
                                Number(t.amount) < 0 ? "text-red-600" : "text-green-600"
                              }`}
                            >
                              {Number(t.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  setUploadResult(null);
                  navigate("/review");
                }}
                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 font-medium"
              >
                Review transactions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
