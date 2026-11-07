export type Category = 'ac_service' | 'washer' | 'plumbing' | 'electrical' | 'cleaning';
export type ModelId = 'gpt-6-luna' | 'gpt-6.1-terra' | 'gpt-5.4-nano';
export interface ModelConfig { request_model: ModelId; bill_model: ModelId }
export interface RequestModels { enabled: boolean; selected: ModelConfig; initial: ModelConfig; available: Array<{id:ModelId;label:string}>; revision:number; busy:boolean }
export type Engine = 'rules' | 'model';
export type Unit = 'job' | 'unit' | 'pcs' | 'service' | 'hour' | 'm2';
export type BuyerAction = 'ask_detail' | 'counter' | 'counter_terms' | 'close';
export type Cite = 'none' | 'competitor_best' | 'target' | 'waive_transport' | 'longer_warranty';
export interface Source { message_id: string; snippet: string }
export interface Weights { price: number; slot: number; trust: number }
export interface Job {
  id: string; category: Category; units: number; scope: string; request_text: string;
  location_label: string; schedule_label: string;
  time_window: { start: string; end: string } | null;
  max_budget: number; target_price: number | null; target_authorized: boolean;
  weights: Weights; created_at: number;
}
export interface CostLine {
  id: string; item_code: string; label: string; unit: Unit; quantity: number;
  unit_price: number | null; condition: string | null;
}
export interface QuoteLine extends CostLine { kind: 'fixed' | 'included' | 'optional' | 'unknown'; source: Source }
export interface TermLine extends CostLine { kind: 'committed' | 'included' | 'optional' | 'unknown'; source_message_id: string }
export interface Quote {
  id: string; branch_id: string; revision: number; category: Category; scope: string;
  units: number; schedule_label: string | null; lines: QuoteLine[];
  status: 'needs_detail' | 'ready' | 'over_budget'; fixed_total: number | null;
  unresolved: Array<'base_price' | 'transport' | 'schedule' | 'scope' | 'unit_quantity'>;
  updated_at: number;
  warranty_days?: number | null; warranty_source?: Source | null;
}
export interface PublicTerms {
  scope: string; units: number; location_label: string; schedule_label: string;
  lines: TermLine[]; committed_total: number; change_reason: string | null;
  warranty_days?: number | null; warranty_source?: Source | null;
}
export interface Terms extends PublicTerms { spending_limit: number }
export interface Acceptance {
  role: 'consumer' | 'provider'; actor_id: string; version_id: string; terms_digest: string;
  accepted_at: number; budget_ack_limit: number | null;
}
export interface Version {
  id: string; number: number; parent_version_id: string | null;
  status: 'draft' | 'pending' | 'active' | 'superseded' | 'rejected';
  terms: Terms; terms_digest: string; acceptances: Acceptance[]; created_at: number;
}
export interface BuyerDecision {
  action: BuyerAction; detail_key: 'base_price' | 'transport' | 'schedule' | 'scope' | 'addon' | null;
  cite: Cite; source_message_ids: string[]; reason: string;
}
export interface BuyerResult extends BuyerDecision { amount: number | null; engine: Engine; rejected?: string }
export interface BuyerContext {
  job_public: { category: Category; scope: string; units: number; location_label: string; schedule_label: string };
  quote: Quote | null; allowed_actions: BuyerAction[];
  available_cites: Partial<Record<'competitor_best' | 'target', { amount: number; quote_id: string | null; revision: number | null }>>;
  available_terms: Array<'waive_transport' | 'longer_warranty'>;
  unresolved: string[]; recent_messages: Array<{ id: string; text: string }>;
}
export interface ModelCall {
  role: 'buyer' | 'formatter' | 'extract' | 'provider' | 'support';
  name: string; schema: object; system: string; user: string; image?: { data: string; mime: string };
}
export type Llm = (args: ModelCall) => Promise<Record<string, unknown> | null>;
export interface ServiceDependencies {
  db: import('node:sqlite').DatabaseSync; now?: () => number;
  speed?: number; roundTimeoutMs?: number; llm?: Llm | null;
}
