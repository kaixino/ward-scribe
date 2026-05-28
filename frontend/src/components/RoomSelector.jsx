import React, { useState, useEffect } from 'react';
import { DoorOpen, ArrowRight, Building2 } from 'lucide-react';
import './RoomSelector.css';

const API_BASE = '/api';

const roomColors = [
  'var(--color-primary)',
  '#5b7faf',
  '#b88dc4',
  '#c97065',
  '#5b9f7a',
  '#e8c87a',
];

export default function RoomSelector({ ward, onSelectRoom, onBack }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRooms();
  }, [ward?.id]);

  async function fetchRooms() {
    if (!ward?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rooms?ward=${ward.id}`);
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="room-selector">
      <div className="room-header">
        <div>
          <h2>
            <Building2 size={20} className="room-ward-icon" />
            {ward?.name}
          </h2>
          <p className="room-subtitle">Select a room to view patients</p>
        </div>
      </div>

      {loading ? (
        <div className="room-loading">
          <p>Loading rooms...</p>
        </div>
      ) : (
        <div className="room-grid">
          {rooms.map((room, index) => (
            <button
              key={room.id}
              className="room-card"
              style={{ '--room-accent': roomColors[index % roomColors.length] }}
              onClick={() => onSelectRoom(room)}
            >
              <div
                className="room-card-icon"
                style={{
                  background: `${roomColors[index % roomColors.length]}18`,
                  color: roomColors[index % roomColors.length],
                }}
              >
                <DoorOpen size={28} />
              </div>
              <div className="room-card-body">
                <h3>{room.name}</h3>
                <p>Select room to view beds</p>
              </div>
              <div className="room-card-arrow">
                <ArrowRight size={20} />
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && rooms.length === 0 && (
        <div className="room-empty">
          <p>No rooms found for this ward.</p>
        </div>
      )}
    </div>
  );
}
