import { apiClient } from './api-client';

export interface GitHubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  description?: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  visibility?: string;
  owner: {
    login: string;
    avatar_url?: string;
    type?: string;
  };
  stargazers_count?: number;
  open_issues_count?: number;
}

export interface GitHubIssueSummary {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: 'open' | 'closed';
  comments: number;
  labels: Array<{ name: string; color?: string }>;
  user?: {
    login: string;
    html_url?: string;
  };
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
}

export interface GitHubIssueAnalysis {
  problemSummary: string;
  evidence: string[];
  rootCauseHypothesis: string;
  confidence: string;
  relevantFiles: string[];
  proposedSolution: string;
  expectedFilesToChange: string[];
  testingPlan: string[];
  risksAndRegressions: string[];
  missingInformation: string[];
}

export interface GitHubInspectedFile {
  path: string;
  matchCount: number;
  preview: string;
  content: string;
}

export interface GitHubValidationResult {
  success: boolean;
  status: 'passed' | 'failed' | 'blocked';
  checks?: Array<{ check: string; exitCode: number; stdout: string; stderr: string; status: string }>;
  message?: string;
}

export const githubSolverService = {
  async healthCheck() {
    return apiClient.get<{
      status: string;
      configured: { gemini: boolean; github: boolean; publishing: boolean; validation: boolean };
    }>(`/github/health`);
  },

  async importRepository(repoUrl: string) {
    return apiClient.post<{ success: boolean; repository: GitHubRepoSummary; message?: string }>(`/github/import`, { repoUrl });
  },

  async loadIssues(owner: string, repo: string, page = 1, perPage = 25) {
    return apiClient.get<{ success: boolean; data: GitHubIssueSummary[]; page: number; perPage: number; total: number }>(`/github/issues`, {
      owner,
      repo,
      page,
      perPage,
    });
  },

  async inspectRepository(payload: {
    owner: string;
    repo: string;
    issue: GitHubIssueSummary;
    keywords?: string[];
  }) {
    return apiClient.post<{ success: boolean; files: GitHubInspectedFile[] }>(`/github/inspect`, payload);
  },

  async generatePatch(payload: {
    owner: string;
    repo: string;
    issue: GitHubIssueSummary;
    analysis?: GitHubIssueAnalysis;
    fileEdits?: Array<{ path: string; before?: string; after: string }>
  }) {
    return apiClient.post<{ success: boolean; reviewId: string; diff: string; changedFiles: string[]; note?: string }>(`/github/generate-patch`, payload);
  },

  async applyPatch(payload: {
    owner: string;
    repo: string;
    patch: string;
    confirm: boolean;
  }) {
    return apiClient.post<{ success: boolean; message: string; changedFiles: string[]; diff: string; status: string }>(`/github/apply-patch`, payload);
  },

  async validateWorkspace(payload: {
    owner: string;
    repo: string;
    reviewId: string;
    checks: Array<'test' | 'lint' | 'typecheck' | 'build'>;
  }) {
    return apiClient.post<GitHubValidationResult>(`/github/validate`, payload);
  },

  async publishToGitHub(payload: {
    owner: string;
    repo: string;
    issueNumber: number;
    base: string;
    title: string;
    body: string;
    reviewId: string;
    confirm: boolean;
  }) {
    return apiClient.post<{ success: boolean; existing: boolean; pr?: { url?: string; number?: number; title?: string; state?: string; head?: string; base?: string; html_url?: string }; message?: string }>(`/github/publish`, payload);
  },

  async analyzeIssue(payload: {
    owner: string;
    repo: string;
    repository?: GitHubRepoSummary;
    issue: GitHubIssueSummary;
  }) {
    return apiClient.post<{
      success: boolean;
      analysis: GitHubIssueAnalysis;
      repository: GitHubRepoSummary;
      issue: GitHubIssueSummary;
      inspectedFiles: GitHubInspectedFile[];
    }>(`/github/analyze`, payload);
  },
};
