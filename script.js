let map;
let waypoints = [];
let waypointId = 1; // Start waypoint ID
let lines; // Polyline to connect waypoints

// 지도 초기화  
function initMap() {
  map = L.map('map').setView([37.475258, 126.650983], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  map.on('click', (e) => addWaypoint(e.latlng.lat, e.latlng.lng));
  lines = L.polyline([], { color: 'blue', weight: 3 }).addTo(map); // Initialize polyline
}

// 웨이포인트 추가
function addWaypoint(lat, lng, alt = 5) {
  const currentId = waypointId; // Capture current ID for this waypoint
  const marker = L.marker([lat, lng], {
    draggable: true,
  }).addTo(map);

  // Add waypoint ID as a small label next to the marker
  marker.bindTooltip(`${currentId}`, { permanent: true, direction: 'top' }).openTooltip();

  // Add drag event listener to update position
  marker.on('dragend', () => {
    const newLatLng = marker.getLatLng();
    const waypoint = waypoints.find((wp) => wp.id === currentId);
    if (waypoint) {
      waypoint.lat = newLatLng.lat;
      waypoint.lng = newLatLng.lng;
      updateTable();
      drawLines(); // Update lines after moving waypoint
    }
  });

  waypoints.push({ id: currentId, lat, lng, alt, marker });
  updateTable();
  drawLines(); // Redraw lines between waypoints
  waypointId++;
}

// 경로 그리기
function drawLines() {
  const latLngs = waypoints.map((wp) => [wp.lat, wp.lng]);
  lines.setLatLngs(latLngs); // Update the polyline with new waypoints
}

// 테이블 업데이트
function updateTable() {
  const tbody = document.querySelector('#waypointTable tbody');
  tbody.innerHTML = '';
  waypoints.forEach((wp, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${wp.lat.toFixed(5)}</td>
      <td>${wp.lng.toFixed(5)}</td>
      <td><input type="number" value="${wp.alt}" onchange="updateAltitude(${wp.id}, this.value)" /></td>
      <td><button onclick="removeWaypoint(${wp.id})">삭제</button></td>
    `;
    tbody.appendChild(row);
  });
}

// 고도 업데이트 함수
function updateAltitude(id, newAlt) {
  const waypoint = waypoints.find((wp) => wp.id === id);
  if (waypoint) {
    waypoint.alt = parseFloat(newAlt);
  }
}

// 웨이포인트 삭제
function removeWaypoint(id) {
  const index = waypoints.findIndex((wp) => wp.id === id);
  if (index > -1) {
    map.removeLayer(waypoints[index].marker); // Remove marker from map
    waypoints.splice(index, 1); // Remove from array
    updateTable();
    drawLines(); // Redraw lines after removing a waypoint
  }
}

// 웨이포인트 초기화
document.getElementById('clearWaypoints').addEventListener('click', () => {
  waypoints.forEach((wp) => map.removeLayer(wp.marker)); // Remove all markers
  waypoints = [];
  lines.setLatLngs([]); // Clear lines
  waypointId = 1; // Reset waypoint ID
  updateTable();
});

// 파일 저장
document.getElementById('saveFile').addEventListener('click', () => {
  if (waypoints.length === 0) {
    alert('저장할 웨이포인트가 없습니다.');
    return;
  }

  // 웨이포인트 데이터를 텍스트 형식으로 변환
  const data = waypoints
    .map((wp, index) => `#${index + 1}\n${wp.lat}\n${wp.lng}`)
    .join('\n');

  const blob = new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'waypoints.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// 파일 불러오기
document.getElementById('loadFile').addEventListener('click', () => {
  const fileInput = document.getElementById('fileInput');
  fileInput.click(); // 파일 입력 클릭
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const lines = event.target.result.split('\n').filter((line) => line.trim() !== '');
        const newWaypoints = [];
        for (let i = 0; i < lines.length; i += 3) {
          const id = parseInt(lines[i].replace('#', '').trim());
          const lat = parseFloat(lines[i + 1].trim());
          const lng = parseFloat(lines[i + 2].trim());
          if (!isNaN(lat) && !isNaN(lng)) {
            newWaypoints.push({ id, lat, lng, alt: 5 });
          }
        }
        waypoints = [];
        waypointId = 1;
        newWaypoints.forEach((wp) => addWaypoint(wp.lat, wp.lng, wp.alt));
      } catch (error) {
        alert('파일을 불러오는 데 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
  }
});

initMap();
