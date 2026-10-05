export type CompressionLevel = 'off' | 'lossless' | 'balanced' | 'small';

export type NumberingSystem =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'latin-lower'
  | 'latin-upper'
  | 'thai';

export interface NumberingSection {
  from: number;
  to: number;
  start: number;
  system: NumberingSystem;
}

export interface PageNumbering {
  sections: NumberingSection[];
  position:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
  fontSize: number;
  color: string;
  margin: number;
  format: 'number' | 'page-number' | 'number-total';
}

export interface WatermarkSettings {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  angle: 0 | 45;
}

export interface PdfOutputSettings {
  numbering?: PageNumbering;
  watermark?: WatermarkSettings;
  compression?: CompressionLevel;
}
