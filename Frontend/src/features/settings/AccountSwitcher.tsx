import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLang } from '@/context/LanguageContext';
import { getAccounts, switchAccount, saveLocalAuthCache, type SwitchableAccount } from '@/api';
import { cacheInvalidate } from '@/utils/dataCache';
import Loader from '@/components/Loader';
import { WORKSPACE_ICON } from '@/types';

// Switch between the workspaces this sign-in unlocked (the server decides and
// enforces the set). Hidden when there's nothing to switch to.
export default function AccountSwitcher() {
  const { t, tServer } = useLang();
  const [accounts, setAccounts] = useState<SwitchableAccount[]>([]);
  const [target, setTarget] = useState<SwitchableAccount | null>(null);

  useEffect(() => {
    let live = true;
    getAccounts()
      .then((res) => { if (live) setAccounts(res.data.data.accounts); })
      .catch(() => { /* optional feature — stay hidden */ });
    return () => { live = false; };
  }, []);

  if (accounts.length < 2) return null;

  const handleSwitch = async (account: SwitchableAccount) => {
    setTarget(account);
    try {
      const { member, wedding } = (await switchAccount(account.memberId)).data.data;
      // Full reload into the new workspace: no state, cache or provider memory
      // from the previous one can survive. Other tabs reload via the storage event.
      cacheInvalidate();
      saveLocalAuthCache(member, wedding);
      window.location.replace('/dashboard');
    } catch (err: any) {
      setTarget(null);
      toast.error(tServer(err?.response?.data?.message) || t('switch.err'));
    }
  };

  return (
    <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)' }}>
      <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>🔁 {t('switch.title')}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2px 0 12px' }}>{t('switch.hint')}</p>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((a) => (
          <li key={a.memberId}>
            <button
              type="button"
              className={`account-row${a.current ? ' is-current' : ''}`}
              onClick={() => handleSwitch(a)}
              disabled={a.current || !!target}
              aria-current={a.current || undefined}
            >
              <span className="account-row-icon" aria-hidden="true">{WORKSPACE_ICON[a.type] ?? '💼'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="account-row-name">{a.workspaceName}</span>
                <span className="account-row-meta">
                  {t(`switch.type.${a.type}`)} · {t(a.role === 'admin' ? 'switch.admin' : 'switch.member')}
                </span>
                {a.pending && <span className="pill pill-warning" style={{ fontSize: '0.66rem', padding: '2px 8px', marginTop: 4 }}>{t('switch.pending')}</span>}
              </span>
              {a.current
                ? <span className="pill pill-success" style={{ fontSize: '0.66rem', padding: '2px 8px' }}>{t('switch.current')}</span>
                : <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>→</span>}
            </button>
          </li>
        ))}
      </ul>

      {target && (
        <div className="modal-backdrop" role="alertdialog" aria-busy="true" aria-label={t('switch.switching', { name: target.workspaceName })}>
          <Loader label={t('switch.switching', { name: target.workspaceName })} />
        </div>
      )}
    </div>
  );
}
