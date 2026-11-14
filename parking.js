'use strict';

const RECORD_KEY = 'parking-latest-location';
const floorLabel = document.getElementById('record-floor');
const savedTime = document.getElementById('record-time');
const locationRow = document.getElementById('location-row');
const locationStatus = document.getElementById('location-status');
const mapLinks = document.getElementById('map-links');
const naverMapLink = document.getElementById('naver-map-link');
const mapLink = document.getElementById('map-link');
const retryButton = document.getElementById('retry-location');
const floorButtons = [...document.querySelectorAll('[data-floor]')];
const customFloor = document.getElementById('custom-floor');
const floorInput = document.getElementById('floor-input');
const notice = document.getElementById('notice');
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
});

let activeAttempt;

function readRecord() {
  const stored = localStorage.getItem(RECORD_KEY);
  return stored ? JSON.parse(stored) : null;
}

function showSaveError() {
  notice.textContent = '이 브라우저에 기록을 저장할 수 없어요. 사이트 저장 설정을 확인해 주세요.';
}

function naverMapUrl({ latitude, longitude }, floor) {
  const android = /Android/i.test(navigator.userAgent);
  if (!android && !/iPhone|iPad|iPod/i.test(navigator.userAgent)) return '';
  if (latitude < 31.43 || latitude > 44.35 || longitude < 122.37 || longitude > 132) return '';

  const params = new URLSearchParams({
    lat: latitude,
    lng: longitude,
    name: '주차 위치 ' + floor,
    appname: new URL('./', window.location.href).href
  });
  const place = 'place?' + params.toString().replaceAll('+', '%20');
  if (!android) return 'nmap://' + place;

  const storeUrl = 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap';
  return 'intent://' + place + '#Intent;scheme=nmap;action=android.intent.action.VIEW;' +
    'category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;' +
    'S.browser_fallback_url=' + encodeURIComponent(storeUrl) + ';end';
}

function displayRecord(record, locating = false, locationError = '') {
  floorLabel.textContent = record?.floor ?? '아직 기록이 없어요';
  floorLabel.classList.toggle('empty', !record);
  savedTime.hidden = !record;
  locationRow.hidden = !record;
  for (const button of floorButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.floor === record?.floor));
  }

  if (!record) return;

  const date = new Date(record.savedAt);
  savedTime.dateTime = date.toISOString();
  savedTime.textContent = dateFormat.format(date);

  const location = record.location;
  mapLinks.hidden = !location;
  retryButton.hidden = locating || Boolean(location);
  if (location) {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set('query', [location.latitude, location.longitude].join(','));
    mapLink.href = url.href;
    const naverUrl = naverMapUrl(location, record.floor);
    naverMapLink.hidden = !naverUrl;
    if (naverUrl) naverMapLink.href = naverUrl;
    else naverMapLink.removeAttribute('href');
    locationStatus.textContent = 'GPS 정확도 약 ' + Math.round(location.accuracy) + 'm';
    return;
  }

  mapLink.removeAttribute('href');
  naverMapLink.removeAttribute('href');
  locationStatus.textContent = locating
    ? 'GPS 위치 확인 중…'
    : locationError || 'GPS 위치 없음';
}

function requestLocation(record) {
  const attempt = { recordId: record.id };
  activeAttempt = attempt;
  displayRecord(record, true);

  function complete(position, errorMessage) {
    if (activeAttempt !== attempt) return;
    activeAttempt = undefined;

    try {
      const latest = readRecord();
      if (latest?.id !== attempt.recordId) return;
      if (position && !latest.location) {
        const { latitude, longitude, accuracy } = position.coords;
        latest.location = { latitude, longitude, accuracy };
        localStorage.setItem(RECORD_KEY, JSON.stringify(latest));
      }
      displayRecord(latest, false, errorMessage);
    } catch {
      showSaveError();
      displayRecord(record);
    }
  }

  if (!window.isSecureContext) {
    complete(null, '위치를 저장하려면 HTTPS 주소로 열어 주세요.');
    return;
  }

  if (document.permissionsPolicy?.allowsFeature('geolocation') === false ||
      document.featurePolicy?.allowsFeature('geolocation') === false) {
    complete(null, '이 화면에서 위치가 차단됐어요. Chrome에서 주소를 직접 열어 주세요.');
    return;
  }

  if (!navigator.geolocation) {
    complete(null, '이 브라우저에서 위치를 사용할 수 없어요.');
    return;
  }

  const success = position => complete(position, '');
  const failed = error => {
    if (activeAttempt !== attempt) return;
    const message = error.code === 1
      ? 'Chrome의 사이트 위치 권한과 휴대폰 위치 설정을 확인해 주세요.'
      : '현재 위치를 찾지 못했어요.';
    complete(null, message);
  };

  navigator.geolocation.getCurrentPosition(success, error => {
    if (activeAttempt !== attempt) return;
    if (error.code === 1) {
      failed(error);
      return;
    }

    navigator.geolocation.getCurrentPosition(success, failed, {
      enableHighAccuracy: false, timeout: 5000, maximumAge: 0
    });
  }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
}

function saveFloor(floor) {
  const id = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const record = { id, floor, savedAt: Date.now(), location: null };
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    showSaveError();
    return false;
  }

  notice.textContent = '';
  requestLocation(record);
  return true;
}

for (const button of floorButtons) {
  button.addEventListener('click', () => saveFloor(button.dataset.floor));
}

document.getElementById('custom-form').addEventListener('submit', event => {
  event.preventDefault();
  const floor = floorInput.value.trim().toUpperCase();
  if (!floor) {
    floorInput.focus();
    return;
  }

  if (saveFloor(floor)) {
    floorInput.value = '';
    customFloor.open = false;
    customFloor.querySelector('summary').focus();
  }
});

retryButton.addEventListener('click', () => {
  try {
    const record = readRecord();
    if (record && !record.location) requestLocation(record);
  } catch {
    showSaveError();
  }
});

window.addEventListener('storage', event => {
  if (event.key !== RECORD_KEY && event.key !== null) return;
  try {
    const record = readRecord();
    if (record?.id !== activeAttempt?.recordId) activeAttempt = undefined;
    displayRecord(record, Boolean(activeAttempt));
  } catch {
    showSaveError();
  }
});

function showLegacyPhoto() {
  if (!('indexedDB' in window)) return;

  const open = indexedDB.open('parking-snapshot');
  open.onupgradeneeded = () => open.transaction.abort();
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('photos')) {
      db.close();
      return;
    }

    const request = db.transaction('photos').objectStore('photos').get('latest');
    request.onsuccess = () => {
      if (!request.result?.image) return;
      document.getElementById('legacy-photo').src = URL.createObjectURL(request.result.image);
      document.getElementById('legacy').hidden = false;
    };
    db.close();
  };
}

try {
  displayRecord(readRecord());
} catch {
  showSaveError();
}
showLegacyPhoto();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
