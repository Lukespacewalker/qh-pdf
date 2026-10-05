import { useI18n } from '../i18n/i18n';

export function Capabilities() {
  const { t } = useI18n();
  return <section className="capabilities" aria-labelledby="capabilities-title">
    <h2 className="sr-only" id="capabilities-title">{t('From files to a finished document')}</h2>
    <div className="capability-grid">
      <div className="capability"><span className="capability-number" aria-hidden="true">01</span><div><h3>{t('Add your files')}</h3><p>{t('Start with PDFs or pictures.')}</p></div></div>
      <div className="capability"><span className="capability-number" aria-hidden="true">02</span><div><h3>{t('Make it yours')}</h3><p>{t('Reorder, rotate, duplicate, or keep the pages you need.')}</p></div></div>
      <div className="capability"><span className="capability-number" aria-hidden="true">03</span><div><h3>{t('Save your PDF')}</h3><p>{t('Download the pages in the order you choose.')}</p></div></div>
    </div>
  </section>;
}
