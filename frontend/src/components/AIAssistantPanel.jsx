import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
  Clock,
  Cpu,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { queryMultiAgent } from '../api';

const QUICK_QUESTIONS = [
  "Analyse high-risk zones in Kamrup Metropolitan and prepare an evacuation planning report.",
  "Evaluate shelter capacities and safest routes from Jalukbari.",
  "Explain contributing risk factors for critical riverfront zones."
];

export default function AIAssistantPanel({ activeScenario, onPanToLocation }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [showTraces, setShowTraces] = useState(false);
  const [approvedActions, setApprovedActions] = useState(new Set());

  const handleRunQuery = async (queryText) => {
    const text = queryText || query;
    if (!text.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await queryMultiAgent(
        text,
        'Kamrup Metropolitan',
        activeScenario?.rain7d,
        activeScenario?.rain15d,
        activeScenario?.rain30d,
        activeScenario?.isSimulated
      );
      setReport(res);
      setQuery(text);
    } catch (err) {
      setError(err.message || 'Failed to query multi-agent system');
    } finally {
      setLoading(false);
    }
  };

  const toggleActionApproval = (actionId) => {
    setApprovedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Header & Framework Badge */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Emergency AI Decision-Support</h3>
              <p className="text-[11px] text-slate-500">Multi-Agent System powered by LangGraph</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase">
            DEMO DATA
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap pt-1 border-t border-blue-200/60">
          <span className="flex items-center gap-1 font-medium">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            <span>3 Specialist Agents:</span>
          </span>
          <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold text-[10px]">Coordinator</span>
          <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold text-[10px]">Risk Analyst (SHAP)</span>
          <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold text-[10px]">Shelter & Route Planner</span>
        </div>
      </div>

      {/* Query Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRunQuery(query);
        }}
        className="space-y-2"
      >
        <div className="relative">
          <textarea
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask the Emergency Coordinator a question or request an evacuation report..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none transition"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2.5 bottom-3.5 w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center transition shadow-xs"
            title="Send query"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suggested Inquiries:</span>
          <div className="flex flex-col gap-1.5">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(q);
                  handleRunQuery(q);
                }}
                disabled={loading}
                className="text-left text-[11px] p-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-900 transition flex items-center justify-between group"
              >
                <span className="truncate pr-2">{q}</span>
                <Sparkles className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </form>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="bg-slate-50 border border-blue-200 rounded-2xl p-5 text-center space-y-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-slate-900">Orchestrating Multi-Agent Pipeline</h4>
            <p className="text-[11px] text-slate-500">
              Coordinating Risk Analyst (SHAP) and Evacuation Planner via LangGraph...
            </p>
          </div>
        </div>
      )}

      {/* Multi-Agent Report Output */}
      {!loading && report && (
        <div className="space-y-3.5 animate-fade-in">
          {/* Status & Invoked Agents Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Decision-Support Briefing</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{report.execution_duration_sec}s</span>
              </span>
            </div>

            {/* Invoked Agents */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agents Invoked:</span>
              <div className="flex flex-wrap gap-1.5">
                {report.agents_invoked.map((agent, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1"
                  >
                    <Bot className="w-3 h-3 text-blue-600" />
                    <span>{agent}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Combined Executive Analysis */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-xs">
            <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Combined Multi-Agent Analysis</span>
            </h4>
            <div className="text-xs text-slate-700 leading-relaxed space-y-2 whitespace-pre-line">
              {report.summary}
            </div>
          </div>

          {/* Recommended Actions for Human Review */}
          {report.recommended_actions && report.recommended_actions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Recommended Actions (Human Sign-off)</span>
                </h4>
                <span className="text-[10px] font-semibold text-slate-400">
                  {approvedActions.size} of {report.recommended_actions.length} signed off
                </span>
              </div>

              <div className="space-y-2.5">
                {report.recommended_actions.map((act) => {
                  const isApproved = approvedActions.has(act.id);
                  const priorityColor =
                    act.priority === 'Urgent'
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : act.priority === 'High'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-blue-100 text-blue-800 border-blue-300';

                  return (
                    <div
                      key={act.id}
                      className={`p-3 rounded-xl border transition ${
                        isApproved
                          ? 'bg-emerald-50/60 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold text-slate-500">{act.id}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${priorityColor}`}>
                            {act.priority}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleActionApproval(act.id)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                            isApproved
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isApproved ? 'Approved' : 'Sign Off'}</span>
                        </button>
                      </div>

                      <p className="font-bold text-xs text-slate-900 mt-1.5 leading-snug">
                        {act.action}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {act.rationale}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conflicts Detected & Limitations Alert */}
          {(report.conflicts_detected?.length > 0 || report.limitations_and_warnings?.length > 0) && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Verification Warnings & Operational Guardrails</span>
              </div>

              {/* Conflicts */}
              {report.conflicts_detected?.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-amber-200/60">
                  <span className="font-bold text-[11px] text-amber-900">Conflict / Bottleneck Alerts:</span>
                  <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                    {report.conflicts_detected.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Limitations */}
              {report.limitations_and_warnings?.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-amber-200/60">
                  <span className="font-bold text-[11px] text-amber-900">Data Limitations & Guardrails:</span>
                  <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                    {report.limitations_and_warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* SHAP Factor Attribution Card (if risk analysis present) */}
          {report.risk_analysis?.shap_explanations && report.risk_analysis.shap_explanations.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>SHAP Explainability (Top Vulnerable Zones)</span>
                </h4>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  TreeSHAP
                </span>
              </div>

              <div className="space-y-3">
                {report.risk_analysis.shap_explanations.map((sh, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">Zone {sh.zone_id}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Risk: {sh.predicted_risk_score} ({sh.risk_level})
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Conf: {(sh.confidence * 100).toFixed(0)}%</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-500">Key Feature Attributions (SHAP Impact):</span>
                      <div className="grid grid-cols-1 gap-1">
                        {sh.top_contributing_factors?.slice(0, 3).map((f, fi) => (
                          <div key={fi} className="flex items-center justify-between text-[11px] bg-white p-1.5 rounded-lg border border-slate-200/80">
                            <span className="font-medium text-slate-700">
                              {f.feature}: <b className="text-slate-900 font-mono">{f.observed_value}</b>
                            </span>
                            <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                              f.impact_direction === 'increases_risk'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {f.shap_attribution > 0 ? `+${f.shap_attribution}` : f.shap_attribution} ({f.impact_direction.replace('_', ' ')})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool Traces & Verified Data Sources Accordion */}
          {report.tool_traces && report.tool_traces.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowTraces(!showTraces)}
                className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-100 transition"
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Tool Outputs & Verified Data Sources ({report.tool_traces.length})</span>
                </div>
                {showTraces ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>

              {showTraces && (
                <div className="p-3.5 pt-0 space-y-2 border-t border-slate-200/80">
                  {report.tool_traces.map((trace, i) => (
                    <div key={i} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-blue-900 font-mono">{trace.tool_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{trace.execution_time_ms} ms</span>
                      </div>
                      <p className="text-[11px] text-slate-700 font-medium">
                        {trace.output_summary}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-100">
                        <span>Agent: <b className="text-slate-600">{trace.agent}</b></span>
                        <span>Source: <b className="text-slate-600">{trace.data_source}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
