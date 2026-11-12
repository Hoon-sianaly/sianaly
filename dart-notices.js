'use strict';

const noticeFeed = document.getElementById('board-notice-feed');
const metricNames = { sales: '매출액', op: '영업이익', net: '당기순이익' };
const noticeDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
});

function noticeElement(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function noticeLink(label, url) {
  const link = noticeElement('a', label);
  link.href = url;
  return link;
}

function renderUpdate({ publishedAt, companies }) {
  const details = noticeElement('details');
  const date = noticeDate.format(new Date(publishedAt));
  details.append(noticeElement('summary', `${date} · ${companies.length}개 기업 업데이트`));
  const companyList = noticeElement('ul');

  for (const company of companies) {
    const item = noticeElement('li');
    item.append(noticeLink(company.name, `/company?company=${encodeURIComponent(company.key)}`));
    const periods = noticeElement('ul');
    for (const period of company.periods) {
      const label = `${period.year}년 ${period.quarter ? `${period.quarter}분기` : '연간'}`;
      const preliminary = period.preliminary ? ' 잠정실적' : '';
      const metrics = period.fields.map(field => metricNames[field]).filter(Boolean).join('·') || '공시 출처 갱신';
      const row = noticeElement('li', `${label}${preliminary} · ${metrics} `);
      row.append(noticeLink('DART 원문', `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(period.receipt)}`));
      periods.append(row);
    }
    item.append(periods);
    companyList.append(item);
  }
  details.append(companyList);
  return details;
}

async function loadDartNotices() {
  try {
    const response = await fetch('/data/dart-updates.json', { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error('Update history unavailable');
    const { updates } = await response.json();
    if (!updates.length) {
      noticeFeed.replaceChildren(noticeElement('p', '아직 반영된 업데이트가 없습니다.'));
      return;
    }
    const entries = updates.map(renderUpdate);
    entries[0].open = true;
    noticeFeed.replaceChildren(...entries);
  } catch {
    const message = noticeElement('p', '업데이트 내역을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
    message.setAttribute('role', 'status');
    noticeFeed.replaceChildren(message);
  } finally {
    noticeFeed.setAttribute('aria-busy', 'false');
  }
}

if (noticeFeed && !document.getElementById('board-notices').hidden) void loadDartNotices();
