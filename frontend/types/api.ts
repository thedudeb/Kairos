export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "number"
  | "file"
  | "dropdown"
  | "checkbox";

export type JobStatus = "draft" | "active" | "closed";

export type JobDescriptionKind = "markdown" | "external";

export interface FormFieldItem {
  id: string;
  label: string;
  field_type: FieldType;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
  file_allowed_types?: string[] | null;
}

export interface AssessmentQuestionItem {
  id: string;
  question_text: string;
  max_duration_seconds: number | null;
  max_attempts: number;
  sort_order: number;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface TemplateOut {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  form_fields: FormFieldItem[];
  assessment_questions: AssessmentQuestionItem[];
}

export interface StageDistributionItem {
  stage_id: string;
  stage_name: string;
  count: number;
}

export interface JobSummary {
  total_applicants: number;
  new_this_week: number;
  new_this_month: number;
  stage_distribution: StageDistributionItem[];
}

export interface JobListItem {
  id: string;
  title: string;
  slug: string;
  status: JobStatus;
  template_id: string | null;
  created_at: string;
  summary: JobSummary;
}

export interface JobOut extends JobListItem {
  description_md: string;
  description_kind: JobDescriptionKind;
  description_external_url: string | null;
  description_summary: string | null;
  updated_at: string;
  form_fields: FormFieldItem[];
  assessment_questions: AssessmentQuestionItem[];
}

export type StaffRole = "admin" | "reviewer";

export interface StaffUserOut {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
}

export interface InviteOut {
  id: string;
  email: string;
  role: StaffRole;
  invited_by_id: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  job_id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
}

export type ParseStatus = "pending" | "parsing" | "parsed" | "failed" | "needs_manual";

export interface EducationOut {
  id: string;
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  sort_order: number;
}

export interface WorkOut {
  id: string;
  company: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  sort_order: number;
}

export interface SkillOut {
  id: string;
  skill: string;
}

export interface ParsedResumeOut {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  top_institution: string | null;
  top_degree: string | null;
  raw_json: Record<string, unknown>;
  confidence_notes: Record<string, unknown> | null;
  parsed_at: string;
  education: EducationOut[];
  work: WorkOut[];
  skills: SkillOut[];
}

export interface CustomFieldValueOut {
  id: string;
  job_form_field_id: string;
  field_label: string;
  value_text: string | null;
  value_file_url: string | null;
}

export interface NoteOut {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  kind: "stage_transition" | "note" | "application_received";
  timestamp: string;
  actor_name: string | null;
  detail: string;
}

export type RankStatus = "pending" | "ranking" | "done" | "failed" | "skipped";

export interface FitScoreOut {
  status: RankStatus;
  fit_score: number | null;
  skills_match: number | null;
  experience_match: number | null;
  trajectory: number | null;
  reasoning: string | null;
  model: string | null;
  error: string | null;
  generated_at: string | null;
}

export interface ApplicantListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  parse_status: ParseStatus;
  current_stage_id: string;
  current_stage_name: string;
  top_institution: string | null;
  top_degree: string | null;
  submitted_at: string;
  stage_entered_at: string;
  resume_url: string;
  fit_score: number | null;
  fit_status: RankStatus | null;
}

export interface ApplicantDetail extends ApplicantListItem {
  job_id: string;
  parse_error: string | null;
  parse_attempts: number;
  parsed_resume: ParsedResumeOut | null;
  custom_fields: CustomFieldValueOut[];
  notes: NoteOut[];
  activity: ActivityEvent[];
  fit_score_detail: FitScoreOut | null;
}
