export type ReportTextKind = 'manager' | 'shift';

export type ReportTextRow = {
  reportAt: Date;
  kind: ReportTextKind;
  subject: string;
  text: string;
};
