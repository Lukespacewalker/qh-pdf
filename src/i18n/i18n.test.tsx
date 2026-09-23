import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandBanner } from '../brand/BrandBanner';
import { Capabilities } from '../workspace/Capabilities';
import { initialOutputDraft, OutputOptions } from '../workspace/OutputOptions';
import { I18nProvider, translate } from './i18n';

describe('Thai UI translation', () => {
  it('translates known messages, interpolates values and leaves unknown content unchanged', () => {
    expect(translate('th', 'Page {current} of {total}', { current: 2, total: 5 })).toBe('หน้า 2 จาก 5');
    expect(translate('th', 'report-final.pdf')).toBe('report-final.pdf');
    expect(translate('en', 'Page {current} of {total}', { current: 2, total: 5 })).toBe('Page 2 of 5');
  });

  it('renders owned guidance and brand copy in Thai without changing the brand name', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="th">
        <Capabilities />
        <BrandBanner />
      </I18nProvider>,
    );

    expect(html).toContain('สิ่งที่คุณทำได้ที่นี่');
    expect(html).toContain('รวมไฟล์เข้าด้วยกัน');
    expect(html).toContain('เครื่องมืออื่นจาก Quack &amp; Honk');
    expect(html).toContain('เยี่ยมชม quackandhonk.com');
  });

  it('shows a localized live page-number example for simple and advanced settings', () => {
    const simple = renderToStaticMarkup(
      <I18nProvider initialLanguage="th">
        <OutputOptions draft={{ ...initialOutputDraft(), numbers: true, start: '27', system: 'latin-lower' }}
          onChange={() => {}} count={40} disabled={false} />
      </I18nProvider>,
    );
    const advanced = renderToStaticMarkup(
      <I18nProvider initialLanguage="en">
        <OutputOptions draft={{ ...initialOutputDraft(), numbers: true, advanced: true,
          sections: [{ from: '1', to: '4', start: '41', system: 'roman-upper' }] }}
          onChange={() => {}} count={4} disabled={false} />
      </I18nProvider>,
    );

    expect(simple).toContain('ตัวอย่าง: aa');
    expect(simple).toContain('<label for="numbering-start">ค่าเริ่มต้น</label>');
    expect(simple).toContain('aria-describedby="number-example"');
    expect(advanced).toContain('Example: XLI');
  });

  it('keeps invalid starting values editable and explains that no example is available', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="th">
        <OutputOptions draft={{ ...initialOutputDraft(), numbers: true, start: '0', system: 'roman-lower' }}
          onChange={() => {}} count={2} disabled={false} />
      </I18nProvider>,
    );

    expect(html).toContain('ยังแสดงตัวอย่างไม่ได้');
  });
});
