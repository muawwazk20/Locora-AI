import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Bot, CheckCircle2, ExternalLink, FileCode2, Github, Loader2, RefreshCcw, Search, Sparkles, ShieldAlert } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { githubSolverService, GitHubIssueAnalysis, GitHubIssueSummary, GitHubInspectedFile, GitHubRepoSummary, GitHubValidationResult } from '../services/github-solver-service';

const defaultRepoUrl = 'https://github.com/vercel/next.js';

export function GithubIssueSolverPage() {
  const { toast } = useToast();
  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl);
  const [repo, setRepo] = useState<GitHubRepoSummary | null>(null);
  const [issues, setIssues] = useState<GitHubIssueSummary[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssueSummary | null>(null);
  const [analysis, setAnalysis] = useState<GitHubIssueAnalysis | null>(null);
  const [inspectedFiles, setInspectedFiles] = useState<GitHubInspectedFile[]>([]);
  const [patch, setPatch] = useState<{ reviewId: string; diff: string; changedFiles: string[]; note?: string } | null>(null);
  const [validation, setValidation] = useState<GitHubValidationResult | null>(null);
  const [validationCheck, setValidationCheck] = useState<'test' | 'lint' | 'typecheck' | 'build'>('test');
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [generatingPatch, setGeneratingPatch] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [confirmPublication, setConfirmPublication] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<Awaited<ReturnType<typeof githubSolverService.healthCheck>> | null>(null);

  useEffect(() => {
    let active = true;
    githubSolverService.healthCheck()
      .then((status) => {
        if (active) setServiceStatus(status);
      })
      .catch(() => {
        if (active) setServiceStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const repoMeta = useMemo(() => {
    if (!repo) return null;
    return {
      owner: repo.owner.login,
      repo: repo.name,
      branch: repo.default_branch,
      visibility: repo.private ? 'private' : 'public',
    };
  }, [repo]);

  const handleImportRepository = async () => {
    setLoadingRepo(true);
    setPrUrl('');
    setAnalysis(null);
    setInspectedFiles([]);
    setPatch(null);
    setValidation(null);
    setConfirmPublication(false);
    try {
      const response = await githubSolverService.importRepository(repoUrl);
      const imported = response.repository;
      setRepo(imported);
      setTargetBranch(imported.default_branch);
      setIssues([]);
      setSelectedIssue(null);
      setPrTitle(`fix: investigate ${imported.name} issue`);
      setPrBody(`## Summary\n\nInvestigating the selected issue for ${imported.full_name}.\n\n## Checklist\n- [ ] Confirm root cause\n- [ ] Add regression coverage\n- [ ] Validate the fix`);
      await loadIssues(imported.owner.login, imported.name);
      toast({ type: 'success', title: 'Repository imported', description: `${imported.full_name} is ready for issue review.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Repository import failed', description: err?.message || 'Unable to access that GitHub repository.' });
    } finally {
      setLoadingRepo(false);
    }
  };

  const loadIssues = async (owner: string, repoName: string) => {
    setLoadingIssues(true);
    try {
      const response = await githubSolverService.loadIssues(owner, repoName, 1, 25);
      setIssues(response.data || []);
      if ((response.data || []).length > 0) {
        setSelectedIssue(response.data[0]);
      } else {
        setSelectedIssue(null);
      }
    } catch (err: any) {
      toast({ type: 'error', title: 'Issue sync failed', description: err?.message || 'Unable to load the repository issue list.' });
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleAnalyzeIssue = async (issue: GitHubIssueSummary) => {
    if (!repo) return;
    setSelectedIssue(issue);
    setLoadingAnalysis(true);
    setAnalysis(null);
    setInspectedFiles([]);
    setPatch(null);
    setValidation(null);
    setConfirmPublication(false);
    setPrUrl('');
    try {
      const response = await githubSolverService.analyzeIssue({
        owner: repo.owner.login,
        repo: repo.name,
        repository: repo,
        issue,
      });
      setAnalysis(response.analysis || null);
      setInspectedFiles(response.inspectedFiles || []);
      toast({ type: 'success', title: 'Issue analysis ready', description: `Root-cause review generated for #${issue.number}.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'AI analysis unavailable', description: err?.message || 'Configure GEMINI_API_KEY to enable the analysis step.' });
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleGeneratePatch = async () => {
    if (!repo || !selectedIssue || !analysis) return;
    setGeneratingPatch(true);
    setPatch(null);
    setValidation(null);
    setConfirmPublication(false);
    try {
      const response = await githubSolverService.generatePatch({
        owner: repo.owner.login,
        repo: repo.name,
        issue: selectedIssue,
        analysis,
      });
      setPatch(response);
      toast({ type: 'success', title: 'Patch ready for review', description: `${response.changedFiles.length} file(s) changed. No repository files were modified.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Patch generation failed', description: err?.message || 'Configure the AI provider and review the repository context.' });
    } finally {
      setGeneratingPatch(false);
    }
  };

  const handleValidatePatch = async () => {
    if (!repo || !patch) return;
    setRunningValidation(true);
    setValidation(null);
    setConfirmPublication(false);
    try {
      const result = await githubSolverService.validateWorkspace({
        owner: repo.owner.login,
        repo: repo.name,
        reviewId: patch.reviewId,
        checks: [validationCheck],
      });
      setValidation(result);
      toast({
        type: result.success ? 'success' : 'error',
        title: result.success ? 'Validation passed' : 'Validation did not pass',
        description: result.message || `${validationCheck} check ${result.status}.`,
      });
    } catch (err: any) {
      const message = err?.message || 'Restricted validation could not be completed.';
      setValidation({ success: false, status: 'blocked', message });
      toast({ type: 'error', title: 'Validation blocked', description: message });
    } finally {
      setRunningValidation(false);
    }
  };

  const handleCreatePullRequest = async () => {
    if (!repoMeta || !selectedIssue || !patch || validation?.status !== 'passed' || !confirmPublication) {
      toast({ type: 'error', title: 'Review and confirmation required', description: 'Generate a patch, review its diff and validation result, then confirm publication.' });
      return;
    }
    setCreatingPr(true);
    setPrUrl('');
    try {
      const response = await githubSolverService.publishToGitHub({
        owner: repoMeta.owner,
        repo: repoMeta.repo,
        issueNumber: selectedIssue.number,
        base: targetBranch || repoMeta.branch,
        title: prTitle || `fix: investigate ${repoMeta.repo}`,
        body: prBody || `Fix for #${selectedIssue.number}\n\n${analysis?.problemSummary || ''}`,
        reviewId: patch.reviewId,
        confirm: true,
      });
      const result = response.pr;
      const verifiedUrl = result?.html_url || result?.url;
      if (!response.success || !verifiedUrl || !result?.number || !result?.head || !result?.base) {
        throw new Error(response.message || 'GitHub did not return verifiable pull request details.');
      }
      setPrUrl(verifiedUrl);
      toast({
        type: 'success',
        title: response.existing ? 'Existing pull request verified' : 'Pull request created and verified',
        description: `#${result.number}: ${result.head} → ${result.base} (${result.state || 'open'}).`,
      });
    } catch (err: any) {
      toast({ type: 'error', title: 'PR creation failed', description: err?.message || 'GitHub rejected the draft PR. Check the head/base branch and token permissions.' });
    } finally {
      setCreatingPr(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="pb-4 border-b border-[#E5E1D8]">
        <div className="flex items-center gap-3 text-[#1E3F35]">
          <div className="p-2 rounded-xl bg-[#ECF3F1] border border-[#D9E8E4]">
            <Github className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">AI Workflow</p>
        </div>
        <h1 className="mt-3 font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#1E2320]">
          GitHub Issue Solver
        </h1>
        <p className="mt-2 text-sm text-[#5F635D] max-w-3xl">
          Import a repository, review live open issues, inspect the evidence, generate an AI diagnosis, and prepare a pull request with explicit confirmation.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5F635D]" aria-live="polite">
          <span>GitHub API: {serviceStatus?.configured.github ? 'authorized' : 'public access only'}</span>
          <span>AI: {serviceStatus?.configured.gemini ? 'configured' : 'not configured'}</span>
          <span>Validation sandbox: {serviceStatus?.configured.validation ? 'configured' : 'blocked until configured'}</span>
          <span>PR publishing: {serviceStatus?.configured.publishing ? 'enabled' : 'disabled'}</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
            <label htmlFor="repoUrl" className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">
              Repository URL
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="repoUrl"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="w-full rounded-xl border border-[#DCD7CF] bg-[#FAF8F5] px-3 py-2.5 text-sm text-[#1E2320] outline-none ring-0 focus:border-[#1E3F35]"
                placeholder="https://github.com/owner/repository"
              />
              <button
                type="button"
                onClick={handleImportRepository}
                disabled={loadingRepo}
                className="inline-flex items-center justify-center rounded-xl bg-[#1E3F35] px-3 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingRepo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {repo && (
            <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="rounded-xl bg-[#F4F1EA] p-2 text-[#1E3F35]">
                    <FileCode2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1E2320] truncate">{repo.full_name}</p>
                    <p className="text-[11px] text-[#5F635D]">{repo.visibility} · default branch {repo.default_branch}</p>
                  </div>
                </div>
                <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-[#1E3F35] hover:text-[#1E2320]">
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
              <p className="text-sm text-[#5F635D] leading-6">{repo.description || 'No repository description provided.'}</p>
              <div className="flex items-center gap-2 text-xs text-[#5F635D]">
                <span className="rounded-full bg-[#ECF3F1] px-2 py-1">{repo.open_issues_count ?? 0} open issues</span>
                <span className="rounded-full bg-[#F4F1EA] px-2 py-1">{repo.stargazers_count ?? 0} stars</span>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-[#1E2320]">Open issues</h2>
              {repo && (
                <button
                  type="button"
                  onClick={() => repo && loadIssues(repo.owner.login, repo.name)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#DCD7CF] bg-[#FAF8F5] px-2 py-1.5 text-xs text-[#1E2320]"
                >
                  <RefreshCcw className="w-3.5 h-3.5" /> Refresh
                </button>
              )}
            </div>

            {loadingIssues ? (
              <div className="flex items-center justify-center py-10 text-[#5F635D]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading issues...
              </div>
            ) : issues.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DCD7CF] bg-[#FAF8F5] p-4 text-sm text-[#5F635D]">
                Import a repository to view live GitHub issues.
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => handleAnalyzeIssue(issue)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${selectedIssue?.id === issue.id ? 'border-[#1E3F35] bg-[#ECF3F1]' : 'border-[#E5E1D8] bg-[#FAF8F5] hover:bg-[#F4F1EA]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5F635D]">#{issue.number}</span>
                      <span className="rounded-full bg-[#E9F2DF] px-2 py-0.5 text-[10px] font-medium text-[#274C3B]">
                        {issue.labels?.length ? issue.labels.map((label) => label.name).slice(0, 2).join(', ') : 'general'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[#1E2320] line-clamp-2">{issue.title}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5F635D]">
                      <span>by {issue.user?.login || 'unknown'}</span>
                      <span>•</span>
                      <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
            {selectedIssue ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">Selected issue</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#1E2320]">#{selectedIssue.number} · {selectedIssue.title}</h2>
                  </div>
                  <a href={selectedIssue.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#ECF3F1] px-2.5 py-1.5 text-xs font-medium text-[#1E3F35]">
                    GitHub <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="mt-4 rounded-xl bg-[#FAF8F5] border border-[#E5E1D8] p-4 text-sm text-[#2B2F2C] leading-7 whitespace-pre-wrap">
                  {selectedIssue.body || 'No issue description was provided.'}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedIssue.labels && selectedIssue.labels.length > 0 ? selectedIssue.labels.map((label) => (
                    <span key={label.name} className="rounded-full bg-[#F4F1EA] px-2 py-1 text-[11px] text-[#1E2320]">
                      {label.name}
                    </span>
                  )) : <span className="rounded-full bg-[#F4F1EA] px-2 py-1 text-[11px] text-[#1E2320]">No labels</span>}
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => handleAnalyzeIssue(selectedIssue)}
                    disabled={loadingAnalysis}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1E3F35] px-3.5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingAnalysis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    {loadingAnalysis ? 'Analyzing...' : 'Analyze issue'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-[#5F635D]">
                <AlertTriangle className="w-5 h-5 mr-2" /> Select an issue to inspect it.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-[#1E3F35]" />
              <h2 className="text-base font-semibold text-[#1E2320]">AI diagnosis</h2>
            </div>

            {!analysis ? (
              <div className="rounded-xl border border-dashed border-[#DCD7CF] bg-[#FAF8F5] p-6 text-sm text-[#5F635D]">
                The diagnosis panel will populate after the issue is analyzed.
              </div>
            ) : (
              <div className="space-y-5">
                {[
                  { label: 'Problem summary', value: analysis.problemSummary },
                  { label: 'Evidence', value: analysis.evidence.join('\n• ') },
                  { label: 'Root cause hypothesis', value: analysis.rootCauseHypothesis },
                  { label: 'Confidence', value: analysis.confidence },
                  { label: 'Proposed solution', value: analysis.proposedSolution },
                  { label: 'Testing plan', value: analysis.testingPlan.join('\n• ') },
                  { label: 'Risks and regressions', value: analysis.risksAndRegressions.join('\n• ') },
                  { label: 'Missing information', value: analysis.missingInformation.join('\n• ') },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1 rounded-xl border border-[#E5E1D8] bg-[#FAF8F5] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F635D]">{label}</p>
                    <p className="text-sm leading-7 text-[#1E2320] whitespace-pre-wrap">{value || 'Not provided.'}</p>
                  </div>
                ))}

                <div className="rounded-xl border border-[#E5E1D8] bg-[#F4F1EA] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F635D]">Relevant files</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[#1E2320] leading-7">
                    {analysis.relevantFiles.length > 0 ? (
                      analysis.relevantFiles.map((file) => <li key={file}>{file}</li>)
                    ) : (
                      <li>No file list was provided in the generated analysis.</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-[#E5E1D8] bg-[#F4F1EA] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F635D]">Expected files to change</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[#1E2320] leading-7">
                    {analysis.expectedFilesToChange.length > 0 ? (
                      analysis.expectedFilesToChange.map((file) => <li key={file}>{file}</li>)
                    ) : (
                      <li>No explicit file list was generated.</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-[#E5E1D8] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F635D]">
                    Inspected source files ({inspectedFiles.length})
                  </p>
                  {inspectedFiles.length === 0 ? (
                    <p className="mt-2 text-sm text-[#5F635D]">No source files matched the issue context.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {inspectedFiles.map((file) => (
                        <details key={file.path} className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F5] p-3">
                          <summary className="cursor-pointer text-sm font-medium text-[#1E3F35]">
                            {file.path} <span className="text-xs font-normal text-[#5F635D]">({file.matchCount} keyword matches)</span>
                          </summary>
                          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#1E2320] p-3 text-xs leading-5 text-[#F4F1EA]">
                            {file.content}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePatch}
                  disabled={generatingPatch || inspectedFiles.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1E3F35] px-3.5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingPatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
                  {generatingPatch ? 'Generating reviewable diff...' : 'Generate code patch'}
                </button>
              </div>
            )}
          </div>

          {patch && (
            <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
              <div className="flex items-center gap-2 mb-4">
                <FileCode2 className="w-5 h-5 text-[#1E3F35]" />
                <h2 className="text-base font-semibold text-[#1E2320]">Generated patch review</h2>
              </div>
              {patch.note && <p className="mb-3 text-sm text-[#5F635D]">{patch.note}</p>}
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5F635D]">Changed files</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[#1E2320] leading-6">
                {patch.changedFiles.map((file) => <li key={file}>{file}</li>)}
              </ul>
              <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#1E2320] p-4 text-xs leading-5 text-[#F4F1EA]">
                {patch.diff}
              </pre>

              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">
                  Restricted validation check
                  <select
                    value={validationCheck}
                    onChange={(event) => {
                      setValidationCheck(event.target.value as 'test' | 'lint' | 'typecheck' | 'build');
                      setValidation(null);
                      setConfirmPublication(false);
                    }}
                    className="mt-2 block w-full rounded-xl border border-[#DCD7CF] bg-[#FAF8F5] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#1E2320]"
                  >
                    <option value="test">Tests</option>
                    <option value="lint">Lint</option>
                    <option value="typecheck">Type check</option>
                    <option value="build">Build</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleValidatePatch}
                  disabled={runningValidation}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1E3F35] px-3.5 py-2.5 text-sm font-medium text-[#1E3F35] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningValidation ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {runningValidation ? 'Running in sandbox...' : 'Run check'}
                </button>
              </div>

              {validation && (
                <div className={`mt-4 rounded-xl border p-4 ${validation.status === 'passed' ? 'border-[#B8D5C7] bg-[#ECF3F1]' : 'border-[#E9D3A5] bg-[#FFF8E8]'}`}>
                  <p className="text-sm font-semibold text-[#1E2320]">Validation: {validation.status}</p>
                  {validation.message && <p className="mt-1 text-sm text-[#5F635D]">{validation.message}</p>}
                  {validation.checks?.map((check) => (
                    <div key={check.check} className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em]">{check.check}: {check.status} (exit {check.exitCode})</p>
                      {(check.stdout || check.stderr) && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#1E2320] p-3 text-xs leading-5 text-[#F4F1EA]">
                          {[check.stdout, check.stderr].filter(Boolean).join('\n')}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {repoMeta && analysis && (
            <div className="rounded-2xl border border-[#E5E1D8] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.03)]">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="w-5 h-5 text-[#1E3F35]" />
                <h2 className="text-base font-semibold text-[#1E2320]">Review & PR</h2>
              </div>

              <div className="space-y-3">
                {patch && (
                  <>
                    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">
                      Target branch (preview)
                      <input
                        value={targetBranch}
                        onChange={(event) => {
                          setTargetBranch(event.target.value);
                          setConfirmPublication(false);
                        }}
                        className="mt-2 w-full rounded-xl border border-[#DCD7CF] bg-[#FAF8F5] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#1E2320] outline-none focus:border-[#1E3F35]"
                      />
                    </label>
                    <p className="rounded-xl border border-[#E9D3A5] bg-[#FFF8E8] p-3 text-sm text-[#5F635D]">
                        A successful sandbox validation is required before publication. Review the complete diff, validation result and target branch.
                    </p>
                  </>
                )}
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">
                  Pull request title
                </label>
                <input
                  value={prTitle}
                  onChange={(event) => setPrTitle(event.target.value)}
                  className="w-full rounded-xl border border-[#DCD7CF] bg-[#FAF8F5] px-3 py-2.5 text-sm text-[#1E2320] outline-none focus:border-[#1E3F35]"
                />

                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#5F635D]">
                  PR description
                </label>
                <textarea
                  value={prBody}
                  onChange={(event) => setPrBody(event.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-[#DCD7CF] bg-[#FAF8F5] px-3 py-2.5 text-sm text-[#1E2320] outline-none focus:border-[#1E3F35]"
                />

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCreatePullRequest}
                    disabled={creatingPr || !patch || validation?.status !== 'passed' || !confirmPublication || !targetBranch.trim() || !serviceStatus?.configured.publishing}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1E3F35] px-3.5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingPr ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {creatingPr ? 'Publishing and verifying...' : 'Publish branch and create PR'}
                  </button>

                  {prUrl && (
                    <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3F35]">
                      View PR <ArrowUpRight className="w-4 h-4" />
                    </a>
                  )}
                </div>
                {patch && validation?.status === 'passed' && (
                  <label className="flex items-start gap-2 rounded-xl border border-[#E5E1D8] bg-[#FAF8F5] p-3 text-sm leading-6 text-[#1E2320]">
                    <input
                      type="checkbox"
                      checked={confirmPublication}
                      onChange={(event) => setConfirmPublication(event.target.checked)}
                      className="mt-1 accent-[#1E3F35]"
                    />
                    I reviewed the changed files, full diff, validation result, risks, and target branch, and explicitly approve publishing this patch to GitHub.
                  </label>
                )}
                {!serviceStatus?.configured.publishing && (
                  <p className="text-xs text-[#8A4B18]">
                    Publishing is blocked until a GitHub token and GITHUB_PUBLISHING_ENABLED=true are configured on a trusted server.
                  </p>
                )}
                {prUrl && (
                  <p className="text-xs text-[#5F635D]">GitHub returned and the server verified the PR URL, number, head/base branches, and status.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
