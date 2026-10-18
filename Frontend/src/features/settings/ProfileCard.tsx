import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { updateProfile, uploadAvatar, removeAvatar } from '@/api';
import { prepareAvatar, type AvatarImageProblem } from '@/utils/avatarImage';
import { pinErrorMessage } from '@/utils/pinErrors';
import Avatar from '@/components/Avatar';
import PinField from '@/components/PinField';
import RollText from '@/components/RollText';
import type { Member } from '@/types';

const MAX_NAME = 50; // mirrors services/memberName on the server
const tidy = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');

// Own photo + display name. For join-code members the name is part of how they
// sign in (code + name + PIN), so renaming spells that out and needs the PIN.
export default function ProfileCard() {
  const { member, wedding, features, login, refreshMembers } = useWedding();
  const { t, tServer } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!member || !wedding) return null;
  const pinUser = !member.email && member.role === 'member';

  const applyMember = (fresh: Member) => {
    login(fresh, wedding);
    if (features.multiMember) refreshMembers();
  };

  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setPhotoBusy(true);
    try {
      const photo = await prepareAvatar(file);
      setPreview(URL.createObjectURL(photo));
      const res = await uploadAvatar(photo);
      applyMember(res.data.data.member);
      toast.success(t('profile.photoSaved'));
    } catch (err) {
      const problem = typeof err === 'string' ? (err as AvatarImageProblem) : null;
      toast.error(problem ? t(problem === 'tooLarge' ? 'profile.errPhotoSize' : 'profile.errPhotoRead') : tServer((err as any)?.response?.data?.message) || t('profile.errPhoto'));
    } finally {
      setPreview(null);
      setPhotoBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      applyMember((await removeAvatar()).data.data.member);
      toast.success(t('profile.photoRemoved'));
    } catch (err: any) {
      toast.error(tServer(err?.response?.data?.message) || t('profile.errPhoto'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const startEdit = () => { setName(member.name); setPin(''); setEditing(true); };

  const onSaveName = async (e: SyntheticEvent) => {
    e.preventDefault();
    const next = tidy(name);
    if (!next || next.length > MAX_NAME) return toast.error(t('profile.errName'));
    if (next === member.name) return setEditing(false);
    if (pinUser && pin.length !== 6) return toast.error(t('pin.errLength'));
    setSaving(true);
    try {
      const res = await updateProfile({ name: next, ...(pinUser && { pin }) });
      applyMember(res.data.data.member);
      toast.success(t('profile.nameSaved'));
      setEditing(false);
    } catch (err) {
      toast.error(pinErrorMessage(err, t, tServer, 'settings.errSave'));
      setPin('');
    } finally {
      setSaving(false);
    }
  };

  const nextName = tidy(name);

  return (
    <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ opacity: photoBusy ? 0.6 : 1, transition: 'opacity 200ms' }}>
          <Avatar name={member.name} src={preview || member.avatar} size={64} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '1.02rem', fontWeight: 700, wordBreak: 'break-word' }}>{member.name}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
            {t(member.role === 'admin' ? 'switch.admin' : 'switch.member')}{member.relation ? ` · ${member.relation}` : ''}
          </p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={onPickPhoto} id="input-avatar" />
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={photoBusy} id="btn-avatar-change">
          <RollText>{photoBusy ? t('profile.photoBusy') : t(member.avatar ? 'profile.changePhoto' : 'profile.addPhoto')}</RollText>
        </button>
        {member.avatar && !photoBusy && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemovePhoto} id="btn-avatar-remove">
            <RollText>{t('profile.removePhoto')}</RollText>
          </button>
        )}
        {!editing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit} id="btn-name-edit">
            <RollText>{t('profile.editName')}</RollText>
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={onSaveName} style={{ marginTop: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="input-profile-name">{t('profile.nameLabel')}</label>
            <input
              id="input-profile-name"
              className="form-input"
              value={name}
              maxLength={MAX_NAME}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          {pinUser ? (
            member.pinSetAt ? (
              <>
                <p className="pill-warning" style={{ fontSize: '0.8rem', lineHeight: 1.5, padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: 12 }} role="note">
                  {t('profile.renameSignInWarning', { name: nextName || '…' })}
                </p>
                <PinField id="input-profile-pin" label={t('pin.current')} value={pin} onChange={setPin} autoComplete="current-password" />
              </>
            ) : (
              <p className="pill-warning" style={{ fontSize: '0.8rem', lineHeight: 1.5, padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: 12 }} role="note">
                {t('profile.errPinRequired')}
              </p>
            )
          ) : features.multiMember && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 12 }}>{t('profile.renameFamilyHint')}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>
              <RollText>{t('common.cancel')}</RollText>
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving || (pinUser && !member.pinSetAt)} id="btn-name-save">
              <RollText>{saving ? t('settings.saving') : t('profile.saveName')}</RollText>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
