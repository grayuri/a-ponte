import type {
  CommitmentStatus,
  HarvestSource,
  NotificationKind,
  NotificationStatus,
  OccurrenceStatus,
  UserRole,
  UserStatus,
} from './enums';

/** Formatos de leitura devolvidos pela API e consumidos pelo Next.js. */

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CurrentUserView {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  institutionId: string | null;
  institutionName: string | null;
}

export interface UserView extends CurrentUserView {
  createdAt: string;
  lastHarvestOn: string | null;
  harvestCount: number;
}

export interface ChainView {
  id: string;
  name: string;
  notes: string | null;
  storeCount: number;
}

export interface StoreView {
  id: string;
  chainId: string;
  chainName: string;
  name: string;
  displayName: string;
  city: string | null;
  address: string | null;
  shiftLabel: string | null;
  active: boolean;
}

export interface InstitutionView {
  id: string;
  name: string;
  shortName: string | null;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  active: boolean;
  memberCount: number;
}

export interface HarvestTypeView {
  id: string;
  code: string;
  label: string;
  active: boolean;
}

export interface CommitmentView {
  id: string;
  storeId: string;
  storeName: string;
  chainName: string;
  institutionId: string;
  institutionName: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  timeLabel: string | null;
  harvestTypeId: string | null;
  harvestTypeLabel: string | null;
  status: CommitmentStatus;
  statusNote: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface OccurrenceView {
  id: string;
  commitmentId: string;
  date: string;
  expectedTime: string;
  timeLabel: string | null;
  storeId: string;
  storeName: string;
  chainName: string;
  institutionId: string;
  institutionName: string;
  coveringInstitutionId: string | null;
  coveringInstitutionName: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  harvestTypeLabel: string | null;
  status: OccurrenceStatus;
  statusReason: string | null;
  harvestId: string | null;
  weightKg: number | null;
}

export interface HarvestView {
  id: string;
  occurrenceId: string | null;
  harvestedOn: string;
  harvestedAt: string | null;
  storeId: string;
  storeName: string;
  chainName: string;
  institutionId: string;
  institutionName: string;
  harvestTypeId: string;
  harvestTypeLabel: string;
  weightKg: number;
  mainFoods: string | null;
  photoUrl: string | null;
  notes: string | null;
  collectorUserId: string | null;
  collectorName: string;
  source: HarvestSource;
  createdAt: string;
}

export interface ComplianceRowView {
  occurrenceId: string;
  date: string;
  storeName: string;
  chainName: string;
  institutionName: string;
  assigneeName: string | null;
  expectedTime: string;
  timeLabel: string | null;
  status: OccurrenceStatus;
  weightKg: number;
}

export interface ComplianceWeekView {
  weekStart: string;
  weekEnd: string;
  totalCommitments: number;
  fulfilled: number;
  pending: number;
  excused: number;
  fulfilledRate: number;
  weightKg: number;
  rows: ComplianceRowView[];
}

export interface DashboardKpiView {
  from: string;
  to: string;
  totalWeightKg: number;
  harvestCount: number;
  storeCount: number;
  institutionCount: number;
  collectorCount: number;
  averageKgPerHarvest: number;
  weightByTypeKg: Record<string, number>;
  fulfilledRate: number;
  pendingCount: number;
}

export interface MonthlyPointView {
  month: number;
  monthLabel: string;
  harvestCount: number;
  weightKg: number;
  share: number;
}

export interface RankingRowView {
  id: string;
  label: string;
  harvestCount: number;
  weightKg: number;
}

export interface WeekdaySummaryView {
  weekday: number;
  weekdayLabel: string;
  harvestCount: number;
  weightKg: number;
}

export interface CalendarCellView {
  day: number;
  harvestCount: number;
  weightKg: number;
}

export interface CalendarRowView {
  storeId: string;
  storeName: string;
  cells: CalendarCellView[];
  totalHarvests: number;
  totalWeightKg: number;
}

export interface CalendarView {
  year: number;
  month: number;
  daysInMonth: number;
  rows: CalendarRowView[];
}

export interface NotificationLogView {
  id: string;
  kind: NotificationKind;
  channel: string;
  status: NotificationStatus;
  recipientName: string | null;
  recipientAddress: string;
  body: string;
  attempts: number;
  error: string | null;
  scheduledFor: string;
  sentAt: string | null;
  createdAt: string;
}

export interface DispatchResultView {
  date: string;
  queued: number;
  skipped: number;
  recipients: number;
}
