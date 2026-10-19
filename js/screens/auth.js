// Signing in. One screen with a few modes (the part after #auth/):
//   #auth            – sign in
//   #auth/signup     – create an account
//   #auth/sent       – "check your email" after signing up or asking for a reset
//   #auth/forgot     – send a password-reset email
//   #auth/password   – choose a new password (after a reset link)
//   #auth/welcome    – invited by email: choose your name and a password
//
// You only need signal here once. After that the phone keeps you signed in.

import { h, formField, passwordField, formMessage, busy } from '../ui.js';
import { signIn, signUp, sendPasswordReset, setPasswordAndName, cachedProfile } from '../account.js';
import { checkSignUp, isEmail } from '../group-rules.js';
import { friendlyError, isOnline } from '../supabase.js';
import { getSetting, setSetting } from '../db.js';

const TITLES = {
  signin: 'Sign in',
  signup: 'Create your account',
  sent: 'Check your email',
  forgot: 'Reset your password',
  password: 'Choose a new password',
  welcome: 'Set up your account',
};

export async function renderAuth({ param }) {
  const mode = TITLES[param] ? param : 'signin';
  const message = formMessage();
  // A message passed from the previous step (e.g. a link that expired).
  const note = await getSetting('authNote');
  if (note) {
    message.show(note.text, note.kind);
    await setSetting('authNote', null);
  }

  const body = h('main', { class: 'content' },
    mode === 'signin' ? null : h('h1', { class: 'screen-title', tabindex: '-1' }, TITLES[mode]),
    await FORMS[mode](message),
  );

  // Sign in opens with what the app is for; the other steps keep it short.
  const top = mode === 'signin'
    ? h('section', { class: 'now auth-hero', 'data-alliance': 'none' },
        h('div', { class: 'now-top' }, h('span', { class: 'wordmark' }, 'Offline Scout')),
        h('h1', { class: 'now-hero', tabindex: '-1' }, 'Scout every match. Even with no signal.'),
        h('p', { class: 'now-sub' }, 'Tap as it happens. Every match saves on your phone, so bad gym wifi never costs you data.'))
    : h('header', { class: 'topbar' }, h('span', { class: 'wordmark' }, 'Offline Scout'));

  const el = h('div', { class: 'screen' },
    top,
    body,
    h('footer', { class: 'bottombar' },
      h('p', { class: 'status' }, 'You need signal to sign in once. After that, Offline Scout works with none.')),
  );
  return { el };
}

function offlineCheck(message) {
  if (isOnline()) return true;
  message.show('This phone has no signal right now. Signing in needs signal once; try again when you have it.', 'error');
  return false;
}

const go = (hash) => { location.hash = hash; };

const FORMS = {
  async signin(message) {
    const email = formField('Email', { type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off' });
    const password = passwordField('Password', 'current-password');
    const submit = h('button', { class: 'pill big block', type: 'submit' }, 'Sign in');
    const form = h('form', { class: 'form', novalidate: true },
      message.el, email.el, password.el,
      h('div', { class: 'actions' },
        submit,
        h('a', { class: 'pill secondary block', href: '#auth/signup' }, 'Create account'),
        h('a', { class: 'link-btn', href: '#auth/forgot' }, 'Forgot your password?')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isEmail(email.input.value)) return email.setError('Enter the email you signed up with.');
      if (!password.input.value) return password.setError('Enter your password.');
      if (!offlineCheck(message)) return;
      await busy(submit, 'Signing in…', async () => {
        try {
          await signIn({ email: email.input.value, password: password.input.value });
          go('#home');
        } catch (err) {
          message.show(friendlyError(err), 'error');
        }
      });
    });
    return form;
  },

  async signup(message) {
    const name = formField('Your name', { type: 'text', autocomplete: 'nickname', autocapitalize: 'words', maxlength: 40 },
      'Shown to your Scouting group, e.g. on matches you scout.');
    const email = formField('Email', { type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off' });
    const password = passwordField('Password', 'new-password');
    const submit = h('button', { class: 'pill big block', type: 'submit' }, 'Create account');
    const form = h('form', { class: 'form', novalidate: true },
      h('p', { class: 'lede' }, 'We only store your name and email, so your Scouting group knows who scouted what.'),
      message.el, name.el, email.el, password.el,
      h('div', { class: 'actions' },
        submit,
        h('a', { class: 'pill secondary block', href: '#auth' }, 'I already have an account')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = { name: name.input.value, email: email.input.value, password: password.input.value };
      const errors = checkSignUp(values);
      name.setError(errors.name);
      email.setError(errors.email);
      password.setError(errors.password);
      if (Object.keys(errors).length) return;
      if (!offlineCheck(message)) return;
      await busy(submit, 'Creating…', async () => {
        try {
          const data = await signUp(values);
          // Supabase doesn't say "this email is taken" (so strangers can't
          // check who has an account); an existing account comes back with no identities.
          if (data?.user && data.user.identities?.length === 0) {
            message.show('There’s already an account with that email. Sign in instead, or reset your password.', 'error');
            return;
          }
          await setSetting('authNote', {
            kind: 'info',
            text: `We sent a link to ${values.email.trim()}. Open it on this phone to confirm your email, then you’re in.`,
          });
          go('#auth/sent');
        } catch (err) {
          message.show(friendlyError(err), 'error');
        }
      });
    });
    return form;
  },

  async sent(message) {
    if (message.el.hidden) message.show('Open the link in the email we sent you.');
    return h('div', { class: 'form' }, message.el,
      h('p', { class: 'lede' }, 'No email after a few minutes? Check your spam folder.'),
      h('div', { class: 'actions' }, h('a', { class: 'pill secondary block', href: '#auth' }, 'Back to sign in')));
  },

  async forgot(message) {
    const email = formField('Email', { type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off' });
    const submit = h('button', { class: 'pill big block', type: 'submit' }, 'Send reset link');
    const form = h('form', { class: 'form', novalidate: true },
      h('p', { class: 'lede' }, 'We’ll email you a link to choose a new password.'),
      message.el, email.el,
      h('div', { class: 'actions' }, submit, h('a', { class: 'pill secondary block', href: '#auth' }, 'Back to sign in')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isEmail(email.input.value)) return email.setError('Enter a valid email address.');
      if (!offlineCheck(message)) return;
      await busy(submit, 'Sending…', async () => {
        try {
          await sendPasswordReset(email.input.value);
          await setSetting('authNote', { kind: 'info', text: `If ${email.input.value.trim()} has an account, a reset link is on its way.` });
          go('#auth/sent');
        } catch (err) {
          message.show(friendlyError(err), 'error');
        }
      });
    });
    return form;
  },

  password: (message) => newPasswordForm(message, false),
  welcome: (message) => newPasswordForm(message, true),
};

// Choose a password (and, for invited people, a name).
async function newPasswordForm(message, askName) {
  const profile = await cachedProfile();
  const name = askName ? formField('Your name', { type: 'text', autocomplete: 'nickname', autocapitalize: 'words', maxlength: 40 }) : null;
  if (name && profile?.display_name) name.input.value = profile.display_name;
  const password = passwordField('New password', 'new-password');
  const submit = h('button', { class: 'pill big block', type: 'submit' }, askName ? 'Finish setting up' : 'Save password');
  const form = h('form', { class: 'form', novalidate: true },
    askName ? h('p', { class: 'lede' }, 'You were invited to a Scouting group. Choose the name your group will see and a password.') : null,
    message.el, name?.el, password.el, h('div', { class: 'actions' }, submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = checkSignUp({ name: name ? name.input.value : 'x', email: 'a@b.co', password: password.input.value });
    name?.setError(errors.name);
    password.setError(errors.password);
    if (errors.name || errors.password) return;
    if (!offlineCheck(message)) return;
    await busy(submit, 'Saving…', async () => {
      try {
        await setPasswordAndName({ password: password.input.value, name: name?.input.value.trim() });
        go(askName ? '#groups' : '#home');
      } catch (err) {
        message.show(friendlyError(err), 'error');
      }
    });
  });
  return form;
}
