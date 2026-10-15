// Prints the SES SendEmail request for a test of the owner's review mail: a made-up idea, real layout, dead links.
// Send it with the AWS CLI once SES is set up (domain verified, and in the sandbox the recipient verified too):
//   node scripts/test-mail.mjs > /tmp/mail.json
//   aws sesv2 send-email --region ap-northeast-2 --cli-input-json file:///tmp/mail.json
import { reviewMail } from '../lambda/ideas/core.mjs';

const to = process.argv[2] || 'yeonhyuk.public@gmail.com';
const from = process.env.FROM_EMAIL || 'Vive Museum <noreply@yeonhyuk.me>';
const idea = {
  title: '매일 하나씩 푸는 퍼즐 게임',
  description: '하루에 퍼즐 하나만 열리는 작은 웹 게임이면 좋겠습니다.\n풀고 나면 결과를 이모지 격자로 공유할 수 있게요.',
  email: 'visitor@example.com',
};
const mail = reviewMail({ idea, reviewUrl: 'https://example.invalid/review?t=TEST', test: true });

console.log(JSON.stringify({
  FromEmailAddress: from,
  Destination: { ToAddresses: [to] },
  Content: {
    Simple: {
      Subject: { Data: mail.subject, Charset: 'UTF-8' },
      Body: { Text: { Data: mail.text, Charset: 'UTF-8' }, Html: { Data: mail.html, Charset: 'UTF-8' } },
    },
  },
}, null, 2));
