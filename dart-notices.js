'use strict';

const noticeFeed = document.getElementById('board-notice-feed');
const metricNames = { sales: '매출액', op: '영업이익', net: '당기순이익' };
const noticeDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
});
// One update can cover hundreds of companies; show them in pages so the board stays readable.
const NOTICE_PAGE_SIZE = 24;

function noticeElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function noticeLink(label, url, className) {
  const link = noticeElement('a', label, className);
  link.href = url;
  return link;
}

function periodLabel(period) {
  const label = `${period.year}년 ${period.quarter ? `${period.quarter}분기` : '연간'}`;
  const preliminary = period.preliminary ? ' 잠정' : '';
  const metrics = period.fields.map(field => metricNames[field]).filter(Boolean).join('·') || '공시 출처 갱신';
  return `${label}${preliminary} · ${metrics}`;
}

function renderCompany(company) {
  const item = noticeElement('li', undefined, 'notice-company');
  item.append(noticeLink(company.name, `/company?company=${encodeURIComponent(company.key)}`, 'notice-company-name'));
  for (const period of company.periods) {
    const row = noticeElement('span', periodLabel(period), 'notice-period');
    const source = noticeLink('DART 원문', `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(period.receipt)}`, 'notice-source');
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    row.append(' ', source);
    item.append(row);
  }
  return item;
}

function renderCompanyPage(list, more, companies) {
  const shown = list.childElementCount;
  for (const company of companies.slice(shown, shown + NOTICE_PAGE_SIZE)) list.append(renderCompany(company));
  const remaining = companies.length - list.childElementCount;
  more.hidden = remaining <= 0;
  more.textContent = `${Math.min(remaining, NOTICE_PAGE_SIZE)}개 더 보기 (남은 기업 ${remaining}개)`;
}

function renderUpdate({ publishedAt, companies }) {
  const details = noticeElement('details', undefined, 'notice-update');
  const summary = noticeElement('summary');
  summary.append(
    noticeElement('span', noticeDate.format(new Date(publishedAt)), 'notice-date'),
    noticeElement('span', `${companies.length}개 기업 실적 반영`, 'notice-count'),
  );
  details.append(summary);
  // Build the company list only when the reader opens it.
  details.addEventListener('toggle', () => {
    if (!details.open || details.dataset.rendered) return;
    details.dataset.rendered = 'true';
    const list = noticeElement('ul', undefined, 'notice-companies');
    const more = noticeElement('button', undefined, 'notice-more');
    more.type = 'button';
    more.addEventListener('click', () => renderCompanyPage(list, more, companies));
    details.append(list, more);
    renderCompanyPage(list, more, companies);
  });
  return details;
}

async function loadDartNotices() {
  try {
    // Same-origin credentials let the feed load behind Cloudflare Access on the development site.
    const response = await fetch('/data/dart-updates.json', { cache: 'no-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Update history unavailable');
    const { updates } = await response.json();
    if (!updates.length) {
      noticeFeed.replaceChildren(noticeElement('p', '아직 반영된 업데이트가 없습니다.'));
      return;
    }
    const [latest, ...older] = updates.map(renderUpdate);
    const entries = [latest];
    if (older.length) {
      const archive = noticeElement('details', undefined, 'notice-archive');
      archive.append(noticeElement('summary', `이전 업데이트 ${older.length}건`), ...older);
      entries.push(archive);
    }
    noticeFeed.replaceChildren(...entries);
    // Links to /board#board-notices (the former notices page) open the latest update directly.
    if (location.hash === '#board-notices') latest.open = true;
  } catch {
    const message = noticeElement('p', '업데이트 내역을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
    message.setAttribute('role', 'status');
    noticeFeed.replaceChildren(message);
  } finally {
    noticeFeed.setAttribute('aria-busy', 'false');
  }
}

if (noticeFeed && !document.getElementById('board-notices').hidden) void loadDartNotices();
