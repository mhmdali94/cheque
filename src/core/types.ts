/** نموذج البيانات. كل الأبعاد بالمليمتر، وكل المعرّفات UUID، والمبالغ جنيهات صحيحة. */
import type { AmountProtection, AmountSignSide } from './digits';

export type Align = 'right' | 'center' | 'left';

/** مستطيل بإحداثيات الشيك في وضع القراءة: x من الحافة الشمال، y من الحافة العليا. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextField extends Box {
  fontSizePt: number;
  minFontSizePt: number;
  align: Align;
  maxLines: number;
  enabled: boolean;
  bold: boolean;
}

export interface DateField extends TextField {
  mode: 'cells' | 'text';
  /** مركز أقرب خانة للحافة الشمال، بالمليمتر. */
  firstCellCenterX: number;
  /** المسافة بين مراكز الخانات المتجاورة. */
  cellPitch: number;
  /**
   * ymd: سنة شهر يوم من الشمال لليمين (الترتيب العربي، اليوم على اليمين).
   * ltr: يوم شهر سنة من الشمال لليمين. rtl: عكس ltr رقم برقم.
   */
  cellOrder: 'ymd' | 'ltr' | 'rtl';
}

export interface AmountWordsField {
  line1: TextField;
  line2: TextField;
  fillRemainder: boolean;
}

export interface AmountDigitsField extends TextField {
  signSide: AmountSignSide;
}

export interface CrossingField extends TextField {
  angleDeg: number;
  /** خطان إضافيان للشيكات اللي مفيهاش تسطير مطبوع. */
  lineGapMm: number;
}

export interface StubConfig {
  enabled: boolean;
  widthMm: number;
  date: TextField;
  payee: TextField;
  amount: TextField;
}

export type TemplateAccuracy = 'approximate' | 'unmeasured' | 'adjusted';

export interface ChequeTemplate {
  id: string;
  name: string;
  bankName: string;
  modelName: string;
  /** الضلع الطويل في وضع القراءة. */
  lengthMm: number;
  /** الضلع القصير في وضع القراءة. */
  widthMm: number;
  accuracy: TemplateAccuracy;
  /** من الحافة العليا: كل ما تحته منطقة ترميز ممنوعة. */
  micrLineY: number;
  signatureBox: Box;
  /** موضع خطي التسطير المطبوعين، للمعاينة فقط. */
  crossingGuide: Box;
  date: DateField;
  payee: TextField;
  amountWords: AmountWordsField;
  amountDigits: AmountDigitsField;
  crossing: CrossingField;
  signatoryName: TextField;
  memo: TextField;
  stub: StubConfig;
  imageId?: string;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CrossingKind = 'none' | 'firstBeneficiary' | 'special' | 'notNegotiable' | 'free';

export interface CrossingValue {
  kind: CrossingKind;
  /** اسم البنك في التسطير الخاص، أو العبارة الحرة. */
  text: string;
  drawLines: boolean;
}

export type ChequeStatus = 'draft' | 'printed' | 'cancelled' | 'damaged';

export interface Company {
  id: string;
  name: string;
  color: string;
  tafqeetPresetId: string;
  customPattern?: string;
  amountProtection: AmountProtection;
  amountLimit?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BankAccount {
  id: string;
  companyId: string;
  bankName: string;
  label: string;
  accountNumber: string;
  templateId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChequeBook {
  id: string;
  companyId: string;
  accountId: string;
  fromNumber: number;
  toNumber: number;
  /** عدد خانات الرقم، للحفاظ على الأصفار البادئة. */
  numberWidth: number;
  createdAt: number;
  updatedAt: number;
}

export interface Cheque {
  id: string;
  companyId: string;
  accountId: string;
  bookId: string;
  templateId: string;
  number: number | null;
  status: ChequeStatus;
  payee: string;
  /** null لحد ما المحاسب يكتب مبلغ صحيح في المسودة. */
  amount: number | null;
  /** القروش من ٠ لـ ٩٩. الشيكات القديمة مفيهاش الحقل ده، فيعتبر صفر. */
  piasters?: number;
  /** النص كما كتبه المحاسب، عشان المسودة ترجع زي ما هي. */
  amountInput: string;
  date: string;
  memo: string;
  signatoryName: string;
  crossing: CrossingValue;
  printStub: boolean;
  /** نسخة القالب وقت الطباعة، عشان الشيك القديم يرجع بالظبط. */
  templateSnapshot?: ChequeTemplate;
  printedAt?: number;
  printCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Payee {
  id: string;
  companyId: string;
  name: string;
  useCount: number;
  updatedAt: number;
}

export interface Signatory {
  id: string;
  companyId: string;
  name: string;
  updatedAt: number;
}

export interface StoredImage {
  id: string;
  mime: string;
  data: Blob;
  updatedAt: number;
}

export type PageMode = 'a4' | 'chequeSize';
export type Rotation = 0 | 90 | 180 | 270;
export type PageAlign = 'center' | 'right' | 'left';

export interface PrinterProfile {
  id: string;
  name: string;
  pageMode: PageMode;
  rotation: Rotation;
  /** تصحيح القلب الأفقي من معالج الاتجاه. */
  mirrored: boolean;
  align: PageAlign;
  /** الهامش غير القابل للطباعة عند الحافة اللي بتدخل الأول. */
  leadingMarginMm: number;
  builtin: boolean;
  updatedAt: number;
}

export interface Calibration {
  /** printerId + ':' + deviceId */
  id: string;
  printerId: string;
  deviceId: string;
  deviceName: string;
  /** إزاحة بمحاور الشيك: موجب x لليمين، موجب y لتحت. */
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  updatedAt: number;
}

export type AuditAction = 'create' | 'update' | 'print' | 'reprint' | 'cancel' | 'damage';

export interface AuditEntry {
  id: string;
  chequeId: string;
  companyId: string;
  action: AuditAction;
  accountant: string;
  at: number;
  detail: string;
}

export interface SettingEntry {
  key: string;
  value: unknown;
}
