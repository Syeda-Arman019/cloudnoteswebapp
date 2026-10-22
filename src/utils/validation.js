/**
 * Reusable validation helpers. Every function returns an error message string,
 * or `null` when the value is valid.
 */

import {
  MAX_CONTENT_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateRequired(value, label = 'This field') {
  if (!value || !String(value).trim()) return `${label} is required.`;
  return null;
}

export function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Email is required.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (!password) return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validateNewPassword(value) {
  const base = validatePassword(value);
  if (base) return base;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

export function validateConfirmation(password, confirmation, label = 'Password confirmation') {
  if (!confirmation) return `${label} is required.`;
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

export function validateFullName(value) {
  const name = String(value || '').trim();
  if (!name) return 'Full name is required.';
  if (name.length < 2) return 'Full name must be at least 2 characters.';
  if (name.length > 80) return 'Full name must be 80 characters or fewer.';
  return null;
}

export function validateTitle(value) {
  const title = String(value || '').trim();
  if (!title) return 'A note title is required.';
  if (title.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateContent(value) {
  const content = String(value || '').trim();
  if (!content) return 'Note content is required.';
  if (content.length > MAX_CONTENT_LENGTH) {
    return `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateCategoryName(value, existingNames = [], currentId = null) {
  const name = String(value || '').trim();
  if (!name) return 'Category name is required.';
  if (name.length < 2) return 'Category name must be at least 2 characters.';
  if (name.length > 40) return 'Category name must be 40 characters or fewer.';

  // Entries may be plain strings or category objects ({ id, name }).
  const clash = existingNames.some((existing) => {
    const existingName = typeof existing === 'string' ? existing : existing?.name;
    const existingId = typeof existing === 'string' ? null : existing?.id;
    if (!existingName || existingId === currentId) return false;
    return existingName.toLowerCase() === name.toLowerCase();
  });

  if (clash) return 'A category with this name already exists.';
  return null;
}

/**
 * Normalises user-entered tags: trims, drops empties, de-duplicates (case-insensitive),
 * caps length and count.
 */
export function normalizeTags(tags = []) {
  const seen = new Set();
  const result = [];
  for (const raw of tags) {
    const tag = String(raw || '').trim().replace(/^#/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag.slice(0, MAX_TAG_LENGTH));
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

export function validateTags(tags = []) {
  if (tags.length > MAX_TAGS) return `Use at most ${MAX_TAGS} tags.`;
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return `Each tag must be ${MAX_TAG_LENGTH} characters or fewer.`;
  }
  return null;
}

/* ------------------------------------------------------------------
   Form-level validators — each returns an object of field -> message.
   ------------------------------------------------------------------ */

export function validateLoginForm(values) {
  const errors = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!String(values.password || '')) errors.password = 'Password is required.';
  return errors;
}

export function validateRegisterForm(values) {
  const errors = {};
  const nameError = validateFullName(values.fullName);
  if (nameError) errors.fullName = nameError;

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const passwordError = validateNewPassword(values.password);
  if (passwordError) errors.password = passwordError;

  const confirmationError = validateConfirmation(values.password, values.confirmPassword);
  if (confirmationError) errors.confirmPassword = confirmationError;

  return errors;
}

export function validateNoteForm(values) {
  const errors = {};
  const titleError = validateTitle(values.title);
  if (titleError) errors.title = titleError;

  const contentError = validateContent(values.content);
  if (contentError) errors.content = contentError;

  return errors;
}

export function validateProfileForm(values) {
  const errors = {};
  const nameError = validateFullName(values.fullName);
  if (nameError) errors.fullName = nameError;
  return errors;
}

export function validateChangePasswordForm(values) {
  const errors = {};
  if (!String(values.currentPassword || '')) {
    errors.currentPassword = 'Enter your current password.';
  }
  const newPasswordError = validateNewPassword(values.newPassword);
  if (newPasswordError) errors.newPassword = newPasswordError;
  if (
    values.currentPassword &&
    values.newPassword &&
    values.currentPassword === values.newPassword
  ) {
    errors.newPassword = 'New password must be different from the current one.';
  }
  const confirmationError = validateConfirmation(
    values.newPassword,
    values.confirmPassword,
    'Password confirmation'
  );
  if (confirmationError) errors.confirmPassword = confirmationError;
  return errors;
}

export function hasErrors(errors = {}) {
  return Object.values(errors).some(Boolean);
}
