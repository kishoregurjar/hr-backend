const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractName,
  extractEmail,
  extractPhone,
  extractSkills,
  parseCandidateData
} = require('../../../src/modules/resume/resume.parser.service');
const { ensureCandidateProfile } = require('../../../src/modules/resume/resume.repository');
const { prisma } = require('../../../src/config/prisma');

test('Resume Extraction and Persistence', async (t) => {

  await t.test('Multiple email addresses - prefer contact section', () => {
    const text = `
    Vishnu Sahu
    Email: vishnu.sahu.cs@gmail.com
    Phone: 7747084778

    Work Experience:
    Worked with dmmehta2@ncsu.edu on a project.
    `;
    const emails = extractEmail(text);
    assert.ok(emails.includes('vishnu.sahu.cs@gmail.com'));
    assert.ok(emails.includes('dmmehta2@ncsu.edu'));
    assert.strictEqual(emails[0], 'vishnu.sahu.cs@gmail.com');
  });

  await t.test('Missing phone numbers', () => {
    const text = `
    Vishnu Sahu
    Email: vishnu.sahu.cs@gmail.com
    `;
    const phones = extractPhone(text);
    assert.strictEqual(phones.length, 0);
  });

  await t.test('Invalid phone-like numbers', () => {
    const text = `
    Vishnu Sahu
    Student ID: 1234567890
    Random date: 2026-09-27
    `;
    const phones = extractPhone(text);
    assert.strictEqual(phones.length, 0);
  });

  await t.test('Names missing from a resume', () => {
    const text = `
    resume
    skills
    Email: vishnu@gmail.com
    `;
    const name = extractName(text, 'vishnu@gmail.com');
    assert.strictEqual(name, null);
  });

  await t.test('Skills containing punctuation, aliases and common words', () => {
    const text = `
    I am proficient in C#, C++, .NET, React.js, Node, and Go.
    `;
    const skills = extractSkills(text);
    assert.ok(skills.includes('C#'));
    assert.ok(skills.includes('C++'));
    assert.ok(skills.includes('.NET'));
    assert.ok(skills.includes('React.js'));
    assert.ok(skills.includes('Node.js'));
    assert.ok(skills.includes('Go'));
  });

  await t.test('parseCandidateData marks ambiguity for multiple emails', () => {
    const text = `
    Vishnu
    vishnu@gmail.com
    dmmehta2@ncsu.edu
    `;
    const result = parseCandidateData(text);
    assert.strictEqual(result._isAmbiguous, true);
    assert.strictEqual(result.email, 'vishnu@gmail.com');
  });

});
