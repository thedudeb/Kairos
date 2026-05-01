"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, RefreshCw, Check, X, ChevronDown, ChevronUp, Zap } from "lucide-react";
import type { PipelineStage } from "@/types/api";
import {
  createIntegration,
  updateIntegration,
  deleteIntegration,
  retryDelivery,
  testIntegration,
} from "./actions";
import { backendFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface IntegrationOut {
  id: string;
  job_id: string;
  stage_id: string;
  stage_name: string;
  endpoint_url: string;
  api_key_masked: string;
  include_assessment: boolean;
  is_active: boolean;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  failure_delivery_count?: number;
}

interface DeliveryOut {
  id: string;
  transition_id: string;
  attempt_number: number;
  is_manual_retry: boolean;
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
  success: boolean;
}

interface Props {
  jobId: string;
  integrations: IntegrationOut[];
  stages: PipelineStage[];
  readOnly?: boolean;
}

const inputCls =
  "block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

export function IntegrationsEditor({ jobId, integrations, stages, readOnly = false }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // New integration form state
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [includeAssessment, setIncludeAssessment] = useState(true);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createIntegration(jobId, {
        stage_id: stageId,
        endpoint_url: endpointUrl,
        api_key: apiKey,
        include_assessment: includeAssessment,
      });
      if (result.ok) {
        setShowForm(false);
        setEndpointUrl("");
        setApiKey("");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create");
      }
    });
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            External integrations
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Configure webhooks to fire when an applicant reaches a specific
            pipeline stage.
          </p>
          {readOnly && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400/90">
              View-only — only admins can add or change integrations.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={readOnly}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-4 w-4" />
          Add integration
        </button>
      </div>

      {/* Create form */}
      {showForm && !readOnly && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            New integration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Trigger on stage
              </label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className={inputCls}
                required
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Endpoint URL
              </label>
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://api.example.com/webhook"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                API key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Bearer token or API key"
                className={inputCls}
                required
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeAssessment}
                onChange={(e) => setIncludeAssessment(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Include assessment questions in payload
              </span>
            </label>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Existing integrations */}
      {integrations.length === 0 && !showForm ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-200 py-16 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-500">No integrations yet</p>
          <p className="mt-1 text-xs text-zinc-400">
            {readOnly
              ? "Admins can add webhooks to notify external systems when applicants progress."
              : "Add a webhook to notify external systems when applicants progress"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integ) => (
            <IntegrationRow
              key={integ.id}
              jobId={jobId}
              integration={integ}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationRow({
  jobId,
  integration,
  readOnly = false,
}: {
  jobId: string;
  integration: IntegrationOut;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deliveries, setDeliveries] = useState<DeliveryOut[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; body?: string; error?: string } | null>(null);
  const [testingPending, startTestTransition] = useTransition();
  const router = useRouter();

  async function loadDeliveries() {
    setLoadingLog(true);
    try {
      const data = await backendFetch<DeliveryOut[]>(
        `/jobs/${jobId}/integrations/${integration.id}/deliveries`,
      );
      setDeliveries(data);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingLog(false);
    }
  }

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && deliveries === null) loadDeliveries();
  }

  function handleDelete() {
    if (!confirm("Delete this integration? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteIntegration(jobId, integration.id);
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      await updateIntegration(jobId, integration.id, {
        is_active: !integration.is_active,
      });
      router.refresh();
    });
  }

  function handleRetry(deliveryId: string) {
    startTransition(async () => {
      await retryDelivery(jobId, integration.id, deliveryId);
      await loadDeliveries();
    });
  }

  function handleTest() {
    setTestResult(null);
    startTestTransition(async () => {
      const result = await testIntegration(jobId, integration.id);
      setTestResult(result);
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Summary row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-2 w-2 rounded-full",
                integration.is_active ? "bg-emerald-400" : "bg-zinc-300",
              )}
            />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {`On "${integration.stage_name}"`}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-400">
            {integration.endpoint_url}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>
              Last success:{" "}
              {integration.last_success_at
                ? new Date(integration.last_success_at).toLocaleString()
                : "—"}
            </span>
            <span>
              Last failure:{" "}
              {integration.last_failure_at
                ? new Date(integration.last_failure_at).toLocaleString()
                : "—"}
            </span>
            <span className="tabular-nums">
              Failed deliveries: {integration.failure_delivery_count ?? 0}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!readOnly && (
            <>
              <button
                onClick={handleToggleActive}
                disabled={isPending}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  integration.is_active
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800",
                )}
              >
                {integration.is_active ? "Active" : "Inactive"}
              </button>
              <button
                onClick={handleTest}
                disabled={testingPending}
                title="Send a sample payload to test the endpoint"
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {testingPending ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Test
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={toggleExpand}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            "border-t px-5 py-3 text-xs",
            testResult.ok && (testResult.status ?? 0) < 300
              ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-400"
              : "border-red-100 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {testResult.ok && (testResult.status ?? 0) < 300
                ? `Test succeeded — HTTP ${testResult.status}`
                : testResult.error
                  ? `Test failed — ${testResult.error}`
                  : `Test failed — HTTP ${testResult.status}`}
            </span>
            <button onClick={() => setTestResult(null)} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
          {testResult.body && (
            <p className="mt-1 truncate opacity-75">{testResult.body}</p>
          )}
        </div>
      )}

      {/* Delivery log */}
      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Delivery log
          </p>
          {loadingLog ? (
            <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />
          ) : deliveries && deliveries.length === 0 ? (
            <p className="text-xs text-zinc-400">No deliveries yet.</p>
          ) : (
            <div className="space-y-2">
              {(deliveries ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-start gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      d.success
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                    )}
                  >
                    {d.success ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>
                        HTTP {d.response_status ?? "—"}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                      {d.is_manual_retry && (
                        <span className="rounded-full bg-blue-100 px-1.5 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                          retry
                        </span>
                      )}
                    </div>
                    {d.error && (
                      <p className="mt-1 truncate text-xs text-red-500">{d.error}</p>
                    )}
                    {d.response_body && (
                      <p className="mt-1 truncate text-xs text-zinc-400">{d.response_body}</p>
                    )}
                  </div>
                  {!d.success && !readOnly && (
                    <button
                      onClick={() => handleRetry(d.id)}
                      disabled={isPending}
                      className="shrink-0 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
