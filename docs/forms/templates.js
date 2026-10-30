// CalmCampus form templates, written in our voice: calm, low-pressure, plain language.
// No clinical screeners (PHQ, GAD, cutoffs) and no self-harm items. Wellbeing wording, not medical claims.
// Block ids are stable strings so results stay comparable across edits.

const opts = (...labels) => labels.map((label, i) => ({ id: 'o' + (i + 1), label }));
const q = (id, type, label, extra = {}) => ({ id, type, label, ...extra });

export const TEMPLATES = [
  {
    id: 'case-study',
    name: 'Student stress & support: demand case study',
    blurb: 'How students handle stress today, what it costs them, and whether something like CalmCampus would help. Anonymous.',
    title: 'How do students handle stress?',
    privacy_mode: 'anonymous',
    settings: {
      view: 'pages', cover: 'sage', wellbeing: true,
      intro: 'A few calm questions about how students deal with stress, and whether something like CalmCampus would help. It takes about four minutes. Every question is optional, so skip anything you’d rather not answer.',
      thanks: 'Thank you. Your answers help us build something that’s actually useful for students.',
      follow_up: { enabled: true, title: 'Want to hear what we find?', text: 'Leave your email if you’d like to hear about the results or the KU Leuven pilot. Optional.', button: 'Keep me posted' },
    },
    doc: { pages: [
      { id: 'p-you', title: 'A little context', blocks: [
        q('stage', 'single_choice', 'Where are you in your studies?', { options: opts('Bachelor, first year', 'Bachelor, second year or later', 'Master', 'PhD or postgraduate', 'Not studying right now'), other: true }),
        q('country', 'single_choice', 'Which country do you study in?', { options: opts('Belgium', 'The Netherlands'), other: true }),
      ] },
      { id: 'p-now', title: 'How things feel lately', blocks: [
        q('week', 'week_scale', 'How’s your week been?'),
        q('energy', 'mood_slider', 'How’s your energy right now?', { minLabel: 'Drained', maxLabel: 'Energised' }),
        q('pileup', 'single_choice', 'How often do things pile up so much that it’s hard to keep up?', { options: opts('Never', 'Rarely', 'Sometimes', 'Often', 'Almost always') }),
        q('heavy', 'multi_choice', 'What tends to make things feel heavy?', { help: 'Pick any that fit.', options: opts('Deadlines and exams', 'Workload', 'Money', 'Housing', 'Feeling lonely or disconnected', 'Sleep', 'Uncertainty about the future'), other: true }),
        q('impact', 'single_choice', 'Over the past month, how much has stress got in the way of your studies?', { options: opts('Not at all', 'A little', 'Somewhat', 'A lot') }),
      ] },
      { id: 'p-today', title: 'What you do today', blocks: [
        q('cope', 'multi_choice', 'When things get heavy, what helps you today?', { help: 'Pick any that fit.', options: opts('Talking to friends or family', 'Exercise or being outside', 'Sleep and rest', 'My study advisor or student services', 'A psychologist or counsellor', 'A wellbeing or meditation app', 'Nothing in particular'), other: true }),
        q('apps', 'single_choice', 'Have you used a wellbeing app, for mindfulness, mood tracking or similar?', { options: opts('Never', 'I tried one and stopped', 'I use one now') }),
        q('stopped', 'multi_choice', 'What made you stop?', { help: 'Pick any that fit.', options: opts('I forgot about it', 'It started to feel like a chore', 'I worried about my privacy', 'It cost too much', 'It didn’t really help'), other: true, show_if: { all: [{ q: 'apps', op: 'eq', value: 'o2' }] } }),
      ] },
      { id: 'p-idea', title: 'An idea', blocks: [
        q('idea', 'info_text', '', { text: 'CalmCampus is an app we’re building for students. It’s a one-minute daily check-in on your phone that helps you notice early signs of overload and take one small step while it’s still easy.\n\nAll your data stays on your phone. It isn’t a medical tool: it supports, it doesn’t diagnose or replace student services or professional care.' }),
        q('interest', 'scale', 'How interested would you be in trying something like this?', { min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very' }),
        q('price', 'single_choice', 'If it cost something, what would feel fair?', { options: opts('Only if it’s free', 'Up to €3 a month', '€3 to €6 a month', 'More than €6 a month', 'Only if my university offered it') }),
      ] },
      { id: 'p-trust', title: 'Trust', blocks: [
        q('worry', 'multi_choice', 'What would worry you about an app like this?', { help: 'Pick any that fit.', options: opts('Where my data goes', 'Who could see it', 'Feeling watched or judged', 'Annoying notifications', 'It not being accurate or useful', 'It taking too much time', 'Nothing in particular'), other: true }),
        q('where', 'single_choice', 'Where would you want your data to be kept?', { options: opts('On my phone only', 'On my phone, with the option to share with a counsellor', 'In the cloud is fine', 'I’m not sure') }),
        q('who', 'single_choice', 'Who would you trust most to offer it?', { options: opts('My university', 'A student-run project', 'A healthcare provider', 'An independent company', 'I’m not sure') }),
      ] },
      { id: 'p-matters', title: 'What matters most', blocks: [
        q('features', 'ranking', 'Which of these would matter most to you?', { options: opts('A quick daily check-in', 'Seeing patterns over time', 'Small suggestions for what to do next', 'All my data staying on my phone', 'Links to student services and support lines', 'Reminders that fit my day') }),
        q('more', 'long_text', 'Anything else you’d like us to know?', { help: 'Please don’t include names or details that could identify you or anyone else.', maxLength: 1500 }),
      ] },
    ] },
  },
  {
    id: 'waitlist',
    name: 'Waitlist',
    blurb: 'Collect an email for launch updates. Identified, with consent and a retention period.',
    title: 'Join the CalmCampus waitlist',
    privacy_mode: 'identified',
    settings: { view: 'pages', cover: 'terracotta', retention_days: 365, purpose: 'To email you when CalmCampus is ready, and for nothing else.', intro: 'Leave your email and we’ll let you know when CalmCampus is ready. No spam, and you can ask us to delete it any time.', thanks: 'You’re on the list. We’ll be in touch when there’s something to share.', wellbeing: false },
    doc: { pages: [{ id: 'p1', title: '', blocks: [
      q('stage', 'dropdown', 'Where are you in your studies?', { options: opts('Bachelor', 'Master', 'PhD or postgraduate', 'Staff', 'Other') }),
      q('uni', 'short_text', 'Which university or school?', { maxLength: 120 }),
    ] }] },
  },
  {
    id: 'pilot-intake',
    name: 'Pilot intake',
    blurb: 'Sign-up for a campus pilot. Identified: collects name and email with explicit consent.',
    title: 'Join the CalmCampus pilot',
    privacy_mode: 'identified',
    settings: { view: 'pages', cover: 'sage', retention_days: 180, purpose: 'To invite you to the pilot and ask about your experience.', intro: 'We’re preparing a pilot at KU Leuven. Tell us a little about yourself and we’ll be in touch about taking part. Taking part will always be voluntary.', thanks: 'Thank you. We’ll be in touch about the pilot.', wellbeing: true },
    doc: { pages: [{ id: 'p1', title: 'About you', blocks: [
      q('uni', 'short_text', 'Which programme and year are you in?', { required: true, maxLength: 160 }),
      q('device', 'single_choice', 'What phone do you use?', { required: true, options: opts('iPhone', 'Android', 'Something else') }),
      q('why', 'long_text', 'What made you interested?', { maxLength: 1000 }),
    ] }] },
  },
  {
    id: 'feedback',
    name: 'Quick feedback',
    blurb: 'A light, anonymous pulse: how’s your week, and one thing you’d change.',
    title: 'Quick feedback',
    privacy_mode: 'anonymous',
    settings: { view: 'steps', cover: 'terracotta', intro: 'Two quick questions. Anonymous, and every one is optional.', thanks: 'Thank you, that really helps.', wellbeing: true },
    doc: { pages: [{ id: 'p1', title: '', blocks: [
      q('week', 'week_scale', 'How’s your week been?'),
      q('change', 'long_text', 'What’s one thing we could do better?', { help: 'Please don’t include names or details that could identify anyone.', maxLength: 800 }),
    ] }] },
  },
];
