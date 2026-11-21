import imageIcon from '../assets/qh-image.svg?no-inline';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n/i18n';

export function RelatedTools() {
  const { t } = useI18n();
  return <aside className="related-tools" aria-labelledby="related-title">
    <h2 id="related-title">{t('More from Quack & Honk')}</h2>
    <div className="related-links">
      <a href="https://image.quackandhonk.com" target="_blank" rel="noopener noreferrer"
        aria-label={t('QH Image (opens in a new tab)')} aria-describedby="related-image-description">
        <span className="related-mark"><img src={imageIcon} alt="" width="34" height="34" /></span>
        <div><h3 translate="no">QH Image</h3><p id="related-image-description">{t('Resize and compress photos for the web.')}</p></div>
        <Icon name="external" />
      </a>
      <a href="https://quackandhonk.com" target="_blank" rel="noopener noreferrer"
        aria-label={t('Meet Quack & Honk (opens in a new tab)')} aria-describedby="related-studio-description">
        <span className="related-mark studio-mark" aria-hidden="true">QH</span>
        <div><h3>{t('Meet Quack & Honk')}</h3><p id="related-studio-description">{t('Apps and illustrated books by two brothers in Thailand.')}</p></div>
        <Icon name="external" />
      </a>
    </div>
  </aside>;
}
