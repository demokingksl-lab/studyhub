import { createClient } from '@supabase/supabase-js';
import { translations } from './translations.js';
import './style.css';

const env = import.meta.env;
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
}) : null;

const $ = (id) => document.getElementById(id);
let language = localStorage.getItem('studyhub-language') === 'en' ? 'en' : 'my';
let mode = 'signup';
let busy = false;
const modal = $('modal');
const form = $('authForm');
const message = $('formMessage');
const toast = $('toast');

function t(key) { return translations[language][key] || translations.my[key] || key; }
function applyLanguage() {
  document.documentElement.lang = language;
  $('language').value = language;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const value = t(el.dataset.i18n);
    if (value.includes('<br>')) el.innerHTML = value;
    else el.textContent = value;
  });
  setMode(mode);
}
function setMode(next) {
  mode = next;
  $('modalTitle').textContent = mode === 'signup' ? t('modalTitle') : t('signInTitle');
  $('modalNote').textContent = mode === 'signup' ? t('modalNote') : t('signInNote');
  $('inviteCode').parentElement.classList.toggle('hidden', mode !== 'signup');
  $('displayName').parentElement.classList.toggle('hidden', mode !== 'signup');
  $('inviteCode').required = mode === 'signup';
  $('displayName').required = mode === 'signup';
  $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('authSubmit').textContent = mode === 'signup' ? t('signInOrUp') : t('signIn');
  $('switchHint').textContent = mode === 'signup' ? t('switchHint') : t('noAccount');
  $('switchMode').textContent = mode === 'signup' ? t('switchSignIn') : t('switchSignUp');
}
function openModal(next='signup') {
  setMode(next); message.textContent = '';
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  setTimeout(() => $(next === 'signup' ? 'inviteCode' : 'email').focus(), 50);
}
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
function showToast(text) {
  toast.textContent = text; toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
function say(key) { message.textContent = t(key); }
function setBusy(value) { busy = value; $('authSubmit').disabled = value; $('authSubmit').textContent = value ? t('pleaseWait') : (mode === 'signup' ? t('signInOrUp') : t('signIn')); }
function friendlyError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return t('invalidCredentials');
  if (msg.includes('already registered') || msg.includes('already been registered')) return t('alreadyRegistered');
  if (msg.includes('rate limit') || msg.includes('too many requests')) return t('rateLimit');
  if (msg.includes('email not confirmed')) return t('confirmEmail');
  return t('genericError');
}
function setMember(user) {
  const dash = $('dashboard');
  dash.classList.toggle('hidden', !user);
  $('userEmail').textContent = user ? user.email : '';
  $('signInTop').textContent = user ? t('memberLabel') : t('signIn');
  $('joinHero').classList.toggle('hidden', !!user);
  $('joinCommunity').classList.toggle('hidden', !!user);
}
async function refreshSession() {
  if (!supabase) { setMember(null); return; }
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);
  setMember(data?.session?.user || null);
}
async function consumeInvite(code, userId) {
  // Invite validation and consumption run in Postgres under a single transaction.
  const { data, error } = await supabase.rpc('redeem_studyhub_invite', { invite_code_input: code });
  if (error || data !== true) {
    // Delete the newly created auth account if invite redemption fails, via admin is intentionally NOT done in browser.
    // Account stays unverified and cannot access member data due to the profile/invite RLS design; support/admin can remove it.
    throw new Error('INVITE_REDEMPTION_FAILED');
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (!supabase) { say('missingConfig'); return; }
  const email = $('email').value.trim();
  const password = $('password').value;
  setBusy(true); message.textContent = '';
  try {
    if (mode === 'signup') {
      const inviteCode = $('inviteCode').value.trim();
      const displayName = $('displayName').value.trim();
      // Validate code before creating account. RPC does not reveal whether a code exists beyond true/false.
      const { data: valid, error: inviteError } = await supabase.rpc('check_studyhub_invite', { invite_code_input: inviteCode });
      if (inviteError || valid !== true) throw new Error('INVITE_REDEMPTION_FAILED');
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/` }
      });
      if (error) throw error;
      if (!data.user) throw new Error('SIGNUP_FAILED');
      // Only redeem after Supabase accepted signup. DB function is atomic and one-time.
      await consumeInvite(inviteCode, data.user.id);
      say('signupSuccess');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeModal(); showToast(t('loginSuccess'));
    }
    await refreshSession();
  } catch (error) {
    console.error('StudyHub auth failure:', error);
    if (error.message === 'INVITE_REDEMPTION_FAILED') say('invalidInvite');
    else say(friendlyError(error));
  } finally { setBusy(false); }
});
$('switchMode').addEventListener('click', () => setMode(mode === 'signup' ? 'signin' : 'signup'));
$('signInTop').addEventListener('click', () => openModal('signin'));
['joinHero','joinCommunity'].forEach(id => $(id).addEventListener('click', () => openModal('signup')));
$('closeModal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('language').addEventListener('change', e => {
  language = e.target.value === 'en' ? 'en' : 'my';
  localStorage.setItem('studyhub-language', language);
  applyLanguage();
});
$('signOut').addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) showToast(t('genericError'));
  else { setMember(null); showToast(t('signedOut')); }
});
document.querySelectorAll('[data-course]').forEach(button => button.addEventListener('click', () => {
  showToast(t('lessonsComing'));
}));
if (supabase) supabase.auth.onAuthStateChange((_event, session) => setMember(session?.user || null));
applyLanguage();
refreshSession();
if (!supabase) console.warn('Supabase config missing. Create .env.local from .env.example and configure the SQL in supabase/schema.sql.');
