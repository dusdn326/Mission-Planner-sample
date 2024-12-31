let map;
let waypoints = [];
let waypointId = 1;
let lines;
let droneMarker = null;
let isAnimating = false;
let isDroneConnected = false;
let isSimulationMode = false;

// 거리 계산 함수
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lat2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c * 1000).toFixed(0);
}

// 지도 초기화
function initMap() {
    map = L.map('map').setView([37.475258, 126.650983], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    map.on('click', (e) => addWaypoint(e.latlng.lat, e.latlng.lng));
    lines = L.polyline([], { color: 'var(--primary-color)', weight: 3 }).addTo(map);
}

// 웨이포인트 추가
function addWaypoint(lat, lng, alt = 5) {
    const currentId = waypointId;
    const marker = L.marker([lat, lng], {
        draggable: true,
    }).addTo(map);

    marker.bindTooltip(`${currentId}`, { permanent: true, direction: 'top' }).openTooltip();

    marker.on('dragend', () => {
        const newLatLng = marker.getLatLng();
        const waypoint = waypoints.find((wp) => wp.id === currentId);
        if (waypoint) {
            waypoint.lat = newLatLng.lat;
            waypoint.lng = newLatLng.lng;
            updateTable();
            drawLines();
        }
    });

    waypoints.push({ id: currentId, lat, lng, alt, marker });
    updateTable();
    drawLines();
    waypointId++;
}

// 경로 그리기 (거리 표시 제거)
function drawLines() {
    map.eachLayer((layer) => {
        if (layer._path) {
            map.removeLayer(layer);
        }
    });

    const points = waypoints.map(wp => [wp.lat, wp.lng]);
    L.polyline(points, { 
        color: 'var(--primary-color)', 
        weight: 3 
    }).addTo(map);
}

// 드론 마커 생성 함수 수정
function createDroneMarker() {
    const droneIcon = L.divIcon({
        html: `
            <div style="transform: rotate(0deg);" class="drone-icon">
                <i class="fas fa-helicopter" style="color: #ff9800; font-size: 24px;"></i>
            </div>
        `,
        className: 'drone-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    return L.marker([0, 0], { icon: droneIcon });
}

// 고도 변경 애니메이션 함수 수정
function animateAltitude(startAlt, endAlt, duration) {
    return new Promise(resolve => {
        const frames = 60;
        const altDiff = endAlt - startAlt;
        let frame = 0;
        
        const animate = () => {
            if (frame >= frames) {
                document.getElementById('altitude').textContent = `${endAlt.toFixed(1)}m`;
                resolve();
                return;
            }
            
            const progress = frame / frames;
            const currentAlt = startAlt + (altDiff * progress);
            document.getElementById('altitude').textContent = `${currentAlt.toFixed(1)}m`;
            
            frame++;
            setTimeout(animate, duration / frames);
        };
        
        animate();
    });
}

// 드론 연결 상태 확인 함수 추가
function checkDroneConnection() {
    if (!isDroneConnected && !isSimulationMode) {
        alert('드론이 연결되어 있지 않습니다.');
        return false;
    }
    return true;
}

// 미션 시작 함수 개선
async function startMission() {
    try {
        if (!checkDroneConnection()) {
            return;
        }

        if (waypoints.length < 2) {
            alert('최소 2개 이상의 웨이포인트가 필요합니다.');
            return;
        }
        
        if (isAnimating) {
            alert('이미 미션이 진행 중입니다.');
            return;
        }

        if (!confirm('미션을 시작하시겠습니까?')) return;

        isAnimating = true;
        let missionCompleted = true;

        try {
            // 기존 드론 마커 제거
            if (droneMarker) {
                map.removeLayer(droneMarker);
            }
            
            droneMarker = createDroneMarker();
            droneMarker.addTo(map);
            
            // 첫 번째 웨이포인트로 드론 이동
            droneMarker.setLatLng([waypoints[0].lat, waypoints[0].lng]);
            map.setView([waypoints[0].lat, waypoints[0].lng], map.getZoom());

            // 미션 시작 전 5초 대기
            document.getElementById('flightMode').textContent = '이륙 준비';
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 이륙 시작 (1초 대기 후 고도 상승)
            document.getElementById('flightMode').textContent = '이륙 중';
            document.getElementById('armStatus').textContent = 'ARMED';
            
            // 초기 이륙 시 첫 번째 웨이포인트의 고도로 상승
            const initialAltitude = waypoints[0].alt;
            await animateAltitude(0, initialAltitude, 2000);
            
            // 이륙 후 1초만 대기 (기존 3초에서 1초로 변경)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 각 웨이포인트 순회
            for (let i = 0; i < waypoints.length - 1; i++) {
                if (!isAnimating) {
                    missionCompleted = false;
                    break;
                }
                
                const start = waypoints[i];
                const end = waypoints[i + 1];
                
                document.getElementById('flightMode').textContent = `자동 (${i + 1}/${waypoints.length - 1})`;
                
                // 고도 차이가 있을 경우 고도 조정
                if (start.alt !== end.alt) {
                    await animateAltitude(start.alt, end.alt, 2000);
                }
                
                await animateDrone(start, end);
            }

            if (missionCompleted && isAnimating) {
                // 착륙 애니메이션 (마지막 웨이포인트의 고도에서 착륙)
                document.getElementById('flightMode').textContent = '착륙 중';
                const finalAltitude = waypoints[waypoints.length - 1].alt;
                await animateAltitude(finalAltitude, 0, 2000);
                alert('미션이 완료되었습니다!');
            }
        } catch (err) {
            missionCompleted = false;
            throw err;
        }

    } catch (err) {
        console.error('미션 실행 오류:', err);
        alert('미션 실행 중 오류가 발생했습니다.');
    } finally {
        isAnimating = false;
        document.getElementById('flightMode').textContent = '수동';
        document.getElementById('armStatus').textContent = 'DISARMED';
        document.getElementById('altitude').textContent = '0m';
        document.getElementById('speed').textContent = '0m/s';
        
        if (droneMarker && droneMarker._map) {
            map.removeLayer(droneMarker);
            droneMarker = null;
        }
    }
}

// 드론 애니메이션 함수 개선
function animateDrone(start, end) {
    return new Promise((resolve, reject) => {
        try {
            const totalDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
            const maxSpeed = 3;
            const minDuration = 4000;
            const duration = Math.max(minDuration, (totalDistance / maxSpeed) * 1000);
            const frames = 120; // 프레임 수 증가
            let frame = 0;
            
            const latDiff = end.lat - start.lat;
            const lngDiff = end.lng - start.lng;
            const angle = Math.atan2(latDiff, lngDiff) * (180 / Math.PI);
            let animationFrame;

            const animate = () => {
                try {
                    if (!isAnimating) {
                        cancelAnimationFrame(animationFrame);
                        resolve();
                        return;
                    }

                    if (frame >= frames) {
                        // 목적지에 정확히 도달
                        droneMarker.setLatLng([end.lat, end.lng]);
                        document.getElementById('speed').textContent = '0m/s';
                        
                        // 웨이포인트 도달 후 대기
                        setTimeout(() => {
                            resolve();
                        }, 3000);
                        return;
                    }
                    
                    const progress = frame / frames;
                    const currentLat = start.lat + (latDiff * progress);
                    const currentLng = start.lng + (lngDiff * progress);
                    
                    // 드론 위치 업데이트
                    if (droneMarker && droneMarker._map) {
                        droneMarker.setLatLng([currentLat, currentLng]);
                        
                        // 드론 회전
                        const droneElement = droneMarker.getElement()?.querySelector('.drone-icon');
                        if (droneElement) {
                            droneElement.style.transform = `rotate(${angle}deg)`;
                        }
                        
                        // 속도 계산 및 업데이트
                        const currentDistance = calculateDistance(start.lat, start.lng, currentLat, currentLng);
                        const currentSpeed = Math.min((currentDistance / (duration / 1000)) * progress, maxSpeed);
                        document.getElementById('speed').textContent = `${currentSpeed.toFixed(1)}m/s`;
                    }
                    
                    frame++;
                    animationFrame = requestAnimationFrame(animate);
                } catch (err) {
                    console.error('Animation error:', err);
                    cancelAnimationFrame(animationFrame);
                    reject(err);
                }
            };
            
            animate();
        } catch (err) {
            console.error('Animation setup error:', err);
            reject(err);
        }
    });
}

// 하이라이트된 웨이포인트 아이콘 생성
function createHighlightedIcon(number) {
    return L.divIcon({
        html: `<div class="waypoint-number highlighted">${number}</div>`,
        className: 'waypoint-marker'
    });
}

// 테이블 업데이트
function updateTable() {
    const tbody = document.querySelector('#waypointTable tbody');
    tbody.innerHTML = '';
    waypoints.forEach((wp, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${wp.lat.toFixed(2)}</td>
            <td>${wp.lng.toFixed(2)}</td>
            <td><input type="number" value="${wp.alt}" onchange="updateAltitude(${wp.id}, this.value)" /></td>
            <td><button class="delete-btn" onclick="removeWaypoint(${wp.id})">삭제</button></td>
        `;
        tbody.appendChild(row);
    });
}

// 고도 업데이트
function updateAltitude(id, newAlt) {
    const waypoint = waypoints.find((wp) => wp.id === id);
    if (waypoint) {
        waypoint.alt = parseFloat(newAlt);
    }
}

// 웨이포인트 제거
function removeWaypoint(id) {
    const index = waypoints.findIndex((wp) => wp.id === id);
    if (index > -1) {
        map.removeLayer(waypoints[index].marker);
        waypoints.splice(index, 1);
        
        // 웨이포인트 번호 재할당
        waypoints.forEach((wp, idx) => {
            wp.id = idx + 1;
            wp.marker.bindTooltip(`${idx + 1}`, { 
                permanent: true, 
                direction: 'top' 
            }).openTooltip();
        });
        
        // 다음 웨이포인트 ID 설정
        waypointId = waypoints.length + 1;
        
        updateTable();
        drawLines();
    }
}

// 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // 시뮬레이션 모드 버튼 이벤트
    document.getElementById('simulationBtn').addEventListener('click', () => {
        isSimulationMode = !isSimulationMode;
        const btn = document.getElementById('simulationBtn');
        if (isSimulationMode) {
            btn.classList.add('active');
            document.getElementById('armStatus').textContent = 'SIMULATION';
            alert('시뮬레이션 모드가 활성화되었습니다.');
        } else {
            btn.classList.remove('active');
            document.getElementById('armStatus').textContent = 'DISARMED';
            alert('시뮬레이션 모드가 비활성화되었습니다.');
        }
    });

    document.getElementById('star').addEventListener('click', startMission);

    // 웨이포인트 초기화
    document.getElementById('clearWaypoints').addEventListener('click', () => {
        // 웨이포인트 마커 제거
        waypoints.forEach(wp => {
            map.removeLayer(wp.marker);
            if (wp.marker.getTooltip()) {
                wp.marker.closeTooltip();
            }
        });

        // 드론 마커 제거
        if (droneMarker) {
            map.removeLayer(droneMarker);
            droneMarker = null;
        }

        // 경로선 제거
        map.eachLayer((layer) => {
            if (layer._path || (layer.options && layer.options.className === 'distance-tooltip')) {
                map.removeLayer(layer);
            }
        });

        // 상태 초기화
        document.getElementById('flightMode').textContent = '수동';
        document.getElementById('armStatus').textContent = 'DISARMED';
        document.getElementById('altitude').textContent = '0m';
        document.getElementById('speed').textContent = '0m/s';

        lines.setLatLngs([]);
        waypoints = [];
        waypointId = 1;
        isAnimating = false;
        updateTable();
    });

    // 파일 저장
    document.getElementById('saveFile').addEventListener('click', () => {
        if (waypoints.length === 0) {
            alert('저장할 웨이포인트가 없습니다.');
            return;
        }

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
        fileInput.click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
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
});