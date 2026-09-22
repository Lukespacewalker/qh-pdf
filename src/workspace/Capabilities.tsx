import { useI18n } from '../i18n/i18n';

export function Capabilities() {
  const { t } = useI18n();
  return <section className="capabilities" aria-labelledby="capabilities-title">
    <div className="capabilities-heading"><h2 id="capabilities-title">{t('What you can do here')}</h2><p>{t('Start with your files. Make the document you need.')}</p></div>
    <div className="capability-grid">
      <div className="capability"><span className="capability-symbol" aria-hidden="true">＋</span><h3>{t('Bring files together')}</h3><p>{t('Combine pages from several PDFs and pictures into one PDF.')}</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">✓</span><h3>{t('Keep the pages you need')}</h3><p>{t('Remove unwanted pages. Duplicate any page you need twice.')}</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">↶</span><h3>{t('Get everything in order')}</h3><p>{t('Drag pages or use the arrows to rearrange them. Rotate sideways pages.')}</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">▧</span><h3>{t('Turn pictures into a PDF')}</h3><p>{t('Put JPG, PNG and WebP pictures into a document you can share.')}</p></div>
    </div>
    <p className="security-note">{t('Working with protected files? Open them with your password, and add a password when you save.')}</p>
  </section>;
}
