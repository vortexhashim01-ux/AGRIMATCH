import './testEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forgotPasswordSchema,
  loginWithPasswordSchema,
  registerSchema,
  requestOTPSchema,
  resetPasswordSchema,
  verifyOTPSchema,
} from '../src/modules/auth/auth.schema';

const PHONE = '+919999999999';

test('an OTP can be requested with a phone number', () => {
  assert.equal(requestOTPSchema.safeParse({ body: { phone: PHONE } }).success, true);
});

test('requesting an OTP without a phone number is rejected', () => {
  // Phone is mandatory: email OTP delivery is disabled.
  const result = requestOTPSchema.safeParse({ body: { email: 'farmer@agrimatch.test' } });

  assert.equal(result.success, false);
  assert.ok(
    !result.success && result.error.issues.some((i) => i.path.join('.') === 'body.phone'),
    'the failure should be attributed to body.phone'
  );
});

test('OTP verification requires a phone number and a 6 digit code', () => {
  assert.equal(
    verifyOTPSchema.safeParse({ body: { phone: PHONE, otp: '123456' } }).success,
    true
  );
  assert.equal(
    verifyOTPSchema.safeParse({ body: { phone: PHONE, otp: '12345' } }).success,
    false
  );
  assert.equal(
    verifyOTPSchema.safeParse({ body: { otp: '123456' } }).success,
    false,
    'phone must be mandatory'
  );
});

test('OTP verification defaults its purpose to verify', () => {
  const result = verifyOTPSchema.safeParse({ body: { phone: PHONE, otp: '123456' } });

  assert.ok(result.success);
  assert.equal(result.data.body.purpose, 'verify');
});

test('password reset is phone based', () => {
  assert.equal(forgotPasswordSchema.safeParse({ body: { phone: PHONE } }).success, true);
  assert.equal(forgotPasswordSchema.safeParse({ body: { email: 'a@b.com' } }).success, false);

  assert.equal(
    resetPasswordSchema.safeParse({ body: { phone: PHONE, otp: '123456', newPassword: 'longenough1' } })
      .success,
    true
  );
  assert.equal(
    resetPasswordSchema.safeParse({ body: { phone: PHONE, otp: '123456', newPassword: 'short' } })
      .success,
    false
  );
});

test('registration only accepts the farmer and buyer roles', () => {
  const base = { fullName: 'Audit Farmer', email: 'farmer@agrimatch.test' };

  assert.equal(registerSchema.safeParse({ body: { ...base, role: 'farmer' } }).success, true);
  assert.equal(registerSchema.safeParse({ body: { ...base, role: 'buyer' } }).success, true);
  assert.equal(registerSchema.safeParse({ body: { ...base, role: 'admin' } }).success, false);
});

test('registration requires at least one of email or phone', () => {
  const result = registerSchema.safeParse({ body: { fullName: 'No Contact', role: 'farmer' } });

  assert.equal(result.success, false);
});

test('registration rejects a password shorter than 8 characters', () => {
  const result = registerSchema.safeParse({
    body: { fullName: 'Audit Farmer', email: 'farmer@agrimatch.test', role: 'farmer', password: 'short12' },
  });

  assert.equal(result.success, false);
});

test('registration defaults the language to English', () => {
  const result = registerSchema.safeParse({
    body: { fullName: 'Audit Farmer', email: 'farmer@agrimatch.test', role: 'farmer' },
  });

  assert.ok(result.success);
  assert.equal(result.data.body.language, 'en');
});

test('password login requires an identifier and a password', () => {
  assert.equal(
    loginWithPasswordSchema.safeParse({ body: { email: 'a@b.com', password: 'secret123' } }).success,
    true
  );
  assert.equal(
    loginWithPasswordSchema.safeParse({ body: { password: 'secret123' } }).success,
    false
  );
  assert.equal(loginWithPasswordSchema.safeParse({ body: { email: 'a@b.com' } }).success, false);
});

test('a malformed phone number is rejected', () => {
  const result = requestOTPSchema.safeParse({ body: { phone: 'not-a-phone' } });

  assert.equal(result.success, false);
});
