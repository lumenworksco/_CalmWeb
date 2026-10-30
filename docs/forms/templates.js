// CalmCampus form templates, written in our voice: calm, low-pressure, plain language.
// No clinical screeners (PHQ, GAD, cutoffs) and no self-harm items. Wellbeing wording, not medical claims.
// Block ids are stable strings so results stay comparable across edits.

const opts = (...labels) => labels.map((label, i) => ({ id: 'o' + (i + 1), label }));
const q = (id, type, label, extra = {}) => ({ id, type, label, ...extra });

export const TEMPLATES = [
  {
    id: 'case-study',
    name: 'Student stress & support: demand case study',
    blurb: 'Ten quick questions on how students feel, what they do, and whether a weekly check-in would help. Anonymous.',
    title: 'How do students handle stress?',
    privacy_mode: 'anonymous',
    settings: {
      view: 'pages', cover: 'sage', wellbeing: true,
      intro: 'A few quick questions about how students deal with feeling run down, and whether a short weekly check-in would help. It takes about two minutes. Four questions are required; skip any of the others. We’re not medical professionals: if you’re struggling, please talk to a doctor or your student support service.',
      thanks: 'Thank you. Your answers help us build something that’s actually useful for students.',
      follow_up: { enabled: true, title: 'Want to hear what we find?', text: 'Leave your email if you’d like to hear about the results or the KU Leuven pilot. Optional.', button: 'Keep me posted' },
    },
    doc: { pages: [
      { id: 'p-you', title: 'About you', blocks: [
        q('level', 'single_choice', 'What level are you studying at?', { required: true, options: opts('Bachelor', 'Master', 'PhD', 'Other') }),
        q('year', 'single_choice', 'Which year are you in?', { options: opts('1st', '2nd', '3rd', '4th or later') }),
      ] },
      { id: 'p-now', title: 'How it feels', blocks: [
        q('exhausted', 'single_choice', 'In the past semester, how often did you feel exhausted or overwhelmed by your studies?', { required: true, options: opts('Never', 'Sometimes', 'Often', 'Almost always') }),
        q('cope', 'multi_choice', 'When that happens, what do you usually do?', { help: 'Pick any that fit.', options: opts('Nothing, I push through', 'Talk to friends or family', 'Contact student support', 'See a doctor'), other: true }),
        q('support', 'single_choice', 'Do you know where to find wellbeing support at your university?', { options: opts('Yes', 'Not really', 'No') }),
      ] },
      { id: 'p-idea', title: 'A weekly check-in', blocks: [
        q('checkin', 'single_choice', 'Would you use a short weekly check-in (under a minute) that helps you notice when you’re running low?', { required: true, options: opts('Yes', 'Maybe', 'No') }),
        q('stop', 'short_text', 'What would make you stop using something like this?', { maxLength: 300 }),
        q('where', 'single_choice', 'Where would you prefer to have it?', { required: true, options: opts('Inside my existing student app', 'A separate app', 'By email', 'A simple web link') }),
        q('privacy', 'scale', 'How important is it that your answers stay completely private?', { max: 5, minLabel: 'Not important', maxLabel: 'Essential' }),
      ] },
      { id: 'p-more', title: 'One last thing', blocks: [
        q('more', 'long_text', 'Anything else you’d like us to know?', { help: 'Optional. Please don’t include names or details that could identify you or anyone else.', maxLength: 1500 }),
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
