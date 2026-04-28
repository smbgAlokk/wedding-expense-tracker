import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWedding } from '../context/WeddingContext';
import toast from 'react-hot-toast';
import { removeMember } from '../api';

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name) { let h=0; for(let i=0;i<(name||'').length;i++) h=name.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }

export default function Members() {
  const navigate = useNavigate();
  const { members, isAdmin, refreshMembers, wedding } = useWedding();

  useEffect(() => { refreshMembers(); }, []);

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Remove ${name} from the wedding?`)) return;
    try {
      await removeMember(id);
      toast.success(`${name} removed`);
      refreshMembers();
    } catch (err) { toast.error(err.response?.data?.message || 'Cannot remove'); }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>←</button>
        <h1>Family Members</h1>
      </div>

      {/* Join Code Card */}
      {wedding?.joinCode && (
        <div className="glass-card" style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>Share this code to invite family</p>
          <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '8px', color: 'var(--primary-light)' }}>{wedding.joinCode}</div>
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => { navigator.clipboard.writeText(wedding.joinCode); toast.success('Code copied!'); }}
          >📋 Copy Code</button>
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>{members.length} members joined</p>

      {members.map(m => (
        <div key={m._id} className="expense-item">
          <div className="avatar" style={{ background: getColor(m.name) }}>
            {(m.name || 'U')[0].toUpperCase()}
          </div>
          <div className="expense-info">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {m.name}
              {m.role === 'admin' && (
                <span style={{ fontSize: '0.65rem', background: 'rgba(216,67,129,0.2)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>ADMIN</span>
              )}
            </h4>
            <p>{m.relation || 'Family'} • Joined {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
          </div>
          {isAdmin && m.role !== 'admin' && (
            <button
              onClick={() => handleRemove(m._id, m.name)}
              style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', padding: '8px' }}
            >✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
