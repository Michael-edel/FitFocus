import React from 'react';
import clsx from 'clsx';
import { LogIn, Plus, Trash2 } from 'lucide-react';
import type { UserProfile } from './types';

type GoogleSignInButtonProps = {
  onAuthed: () => void;
  inviteCode?: string;
  width?: number;
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'continue_with';
};

type AuthChoiceScreenProps = {
  allUsers: UserProfile[];
  inviteCode: string;
  setInviteCode: (value: string) => void;
  inviteError: string | null;
  setInviteError: (value: string | null) => void;
  requireInvite: boolean;
  inviteChecking: boolean;
  startLocalRegistration: () => void;
  deleteUserProfile: (userId: string) => void;
  loginAsUser: (user: UserProfile) => void;
  bootstrapAuth: () => void;
  GoogleSignInButton: React.ComponentType<GoogleSignInButtonProps>;
};

export default function AuthChoiceScreen({
  allUsers,
  inviteCode,
  setInviteCode,
  inviteError,
  setInviteError,
  requireInvite,
  inviteChecking,
  startLocalRegistration,
  deleteUserProfile,
  loginAsUser,
  bootstrapAuth,
  GoogleSignInButton,
}: AuthChoiceScreenProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-left">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2rem] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-indigo-950/50">
            FF
          </div>
        </div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">FitFocus</h1>

        <div className="grid gap-4">
          {allUsers.map(user => (
            <div
              key={user.id}
              onClick={() => void loginAsUser(user)}
              className="flex items-center gap-4 p-5 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl hover:bg-slate-800 transition-all text-left group cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-indigo-500/10 group-hover:bg-indigo-600 transition-all">
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-indigo-400 font-bold text-2xl group-hover:text-white transition-all">{user.name[0].toUpperCase()}</span>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-100 text-lg">{user.name}</p>
                  {user.googleSub ? (
                    <img src="/google-g.svg" alt="Google" title="Профиль Google" className="w-4 h-4 opacity-90" />
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-widest tabular-nums">
                  {user.weight} кг · {user.plan || 'Free'}
                </p>
              </div>

              <button
                type="button"
                className="p-3 rounded-xl hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-all"
                title="Удалить локальный профиль"
                onClick={(e) => {
                  e.stopPropagation();
                  const ok = confirm(`Удалить локальный профиль "${user.name || 'Профиль'}"? Данные восстановить нельзя.`);
                  if (ok) deleteUserProfile(user.id);
                }}
              >
                <Trash2 size={20} />
              </button>

              <LogIn size={20} className="text-slate-600 group-hover:text-indigo-400 shrink-0" />
            </div>
          ))}

          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Код приглашения (beta)</label>
            <input
              value={inviteCode}
              onChange={(e) => {
                const v = e.target.value;
                setInviteCode(v);
                setInviteError(null);
              }}
              placeholder={requireInvite ? 'Обязательно для входа' : 'Опционально'}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
            />
            {requireInvite ? (
              <p className="text-[10px] text-slate-500">Закрытая бета: без кода приглашения профиль создать нельзя.</p>
            ) : null}
            {inviteError ? <p className="text-[11px] text-rose-400 font-semibold">{inviteError}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => void startLocalRegistration()}
              disabled={allUsers.length >= 5 || inviteChecking}
              className="flex items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-800 rounded-[2rem] text-slate-500 hover:text-indigo-400 hover:border-indigo-900 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={20} /> {allUsers.length >= 5 ? 'Лимит профилей (5)' : 'Создать профиль'}
            </button>

            <div className="flex items-center justify-center p-5 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/40">
              <GoogleSignInButton onAuthed={() => void bootstrapAuth()} inviteCode={inviteCode} width={180} size="medium" text="continue_with" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
