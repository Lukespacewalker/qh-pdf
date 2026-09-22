import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandBanner } from '../brand/BrandBanner';
import { Capabilities } from '../workspace/Capabilities';
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
});
