import { useRef } from 'react';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n/i18n';

export function SiteFooter() {
  const { t } = useI18n();
  const about = useRef<HTMLDialogElement>(null);

  return <footer className="site-footer site-width">
    <div className="footer-credit">
      <span className="footer-monogram" aria-hidden="true">QH</span>
      <a href="https://quackandhonk.com" target="_blank" rel="noopener noreferrer"
        aria-label={t('A Quack & Honk tool (opens in a new tab)')}>{t('A Quack & Honk tool')}</a>
    </div>
    <div className="footer-actions">
      <a className="footer-sibling-link" href="https://image.quackandhonk.com" target="_blank" rel="noopener noreferrer"
        aria-label={t('QH Image (opens in a new tab)')}><span translate="no">QH Image</span> <Icon name="external" /></a>
      <button type="button" aria-haspopup="dialog" onClick={() => about.current?.showModal()}>
        {t('Formats & privacy')} <Icon name="external" />
      </button>
    </div>
    <dialog ref={about} className="finishing-dialog formats-dialog" aria-labelledby="formats-heading">
      <div className="finishing-heading">
        <h2 id="formats-heading">{t('Formats & privacy')}</h2>
        <form method="dialog"><button className="btn formats-close" aria-label={t('Close')}><Icon name="close" /></button></form>
      </div>
      <p>{t('Import PDF, JPG/JPEG, PNG and WebP. Download all pages or selected pages as a PDF.')}</p>
      <p>{t('Your documents are processed in this browser without uploads or analytics.')}</p>
      <p>{t('Recovery is off by default. Turn on Remember work on this device to keep original files and page edits in this browser until cleared. Passwords and unlocked copies are never saved.')}</p>
    </dialog>
  </footer>;
}
