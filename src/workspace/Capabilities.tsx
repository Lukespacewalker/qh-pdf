import { useI18n } from '../i18n/i18n';
import { Icon } from '../components/Icon';

export function Capabilities() {
  const { t } = useI18n();
  return <section className="capabilities" aria-labelledby="capabilities-title">
    <h2 id="capabilities-title">{t('Merge and organize PDFs')}</h2>
    <div className="capability-grid">
      <div className="capability"><span className="capability-number" aria-hidden="true">01</span><div><h3>{t('Add files')}</h3><p>{t('Combine multiple files in one PDF.')}</p></div></div>
      <div className="capability"><span className="capability-number" aria-hidden="true">02</span><div><h3>{t('Arrange pages')}</h3><p>{t('Reorder, rotate, duplicate or delete pages.')}</p></div></div>
      <div className="capability"><span className="capability-number" aria-hidden="true">03</span><div><h3>{t('Save PDF')}</h3><p>{t('Download all pages or selected pages.')}</p></div></div>
    </div>
    <div className="welcome-reassurance">
      <p><Icon name="lock" />{t('Your documents stay on this device.')}</p>
      <p>{t('Free to use. No account needed.')}</p>
    </div>
  </section>;
}
