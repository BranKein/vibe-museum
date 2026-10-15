// Lambda entry: wires the idea app to DynamoDB, SES, SSM, GitHub and Turnstile. Uses only the AWS SDK that the
// Node.js runtime already has, so the package is just these files.
//
// Environment (set by vive-infra): TABLE, OWNER_EMAIL, FROM_EMAIL, API_BASE, SITE_URL, ISSUE_REPO, PARAM_PREFIX.
// Parameters under PARAM_PREFIX: token-secret, turnstile-secret, github-token. "unset" counts as not set.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { makeApp } from './app.mjs';

const env = process.env;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ses = new SESv2Client({});
const ssm = new SSMClient({});

let cached = null;
let cachedAt = 0;
async function secrets() {
  if (cached && Date.now() - cachedAt < 5 * 60 * 1000) return cached;
  const names = ['token-secret', 'turnstile-secret', 'github-token'].map((n) => env.PARAM_PREFIX + n);
  const res = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  const value = (n) => {
    const p = (res.Parameters || []).find((x) => x.Name === env.PARAM_PREFIX + n);
    return p && p.Value && p.Value !== 'unset' ? p.Value : '';
  };
  cached = { tokenSecret: value('token-secret'), turnstileSecret: value('turnstile-secret'), githubToken: value('github-token') };
  if (!cached.tokenSecret) throw new Error('token-secret parameter is missing');
  cachedAt = Date.now();
  return cached;
}

const db = {
  async get(pk) {
    return (await doc.send(new GetCommand({ TableName: env.TABLE, Key: { pk } }))).Item || null;
  },
  async put(item) {
    await doc.send(new PutCommand({ TableName: env.TABLE, Item: item }));
  },
  async del(pk) {
    await doc.send(new DeleteCommand({ TableName: env.TABLE, Key: { pk } }));
  },
  async scan() {
    const items = [];
    let start;
    do {
      const res = await doc.send(new ScanCommand({ TableName: env.TABLE, ExclusiveStartKey: start }));
      items.push(...(res.Items || []));
      start = res.LastEvaluatedKey;
    } while (start);
    return items;
  },
  async increment(pk, ttl) {
    const res = await doc.send(new UpdateCommand({
      TableName: env.TABLE, Key: { pk }, UpdateExpression: 'ADD #c :one SET #t = :ttl',
      ExpressionAttributeNames: { '#c': 'count', '#t': 'ttl' }, ExpressionAttributeValues: { ':one': 1, ':ttl': ttl }, ReturnValues: 'UPDATED_NEW',
    }));
    return res.Attributes.count;
  },
};

const mail = {
  async send({ to, subject, text, html }) {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: env.FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } } } },
    }));
  },
};

const github = {
  async createIssue(issue) {
    const { githubToken } = await secrets();
    const res = await fetch('https://api.github.com/repos/' + env.ISSUE_REPO + '/issues', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json', 'User-Agent': 'vive-museum-ideas' },
      body: JSON.stringify(issue),
    });
    if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (await res.text()).slice(0, 200));
    return (await res.json()).number;
  },
};

const turnstile = {
  async verify(token, ip) {
    if (!token) return false;
    const { turnstileSecret } = await secrets();
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: ip }),
    });
    return Boolean(res.ok && (await res.json()).success);
  },
};

export const handler = makeApp({
  db, mail, github, turnstile, secrets,
  config: { apiBase: env.API_BASE, siteUrl: env.SITE_URL, ownerEmail: env.OWNER_EMAIL, issueRepo: env.ISSUE_REPO },
});
