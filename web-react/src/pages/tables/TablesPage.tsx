import React, { useState, useMemo } from 'react';
import { Row, Col, Card, Button, Select, Input, InputNumber, DatePicker, Divider, Tag, Empty, message, Modal, Badge, Descriptions, Space, List } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, PlayCircleOutlined, DollarOutlined, SearchOutlined } from '@ant-design/icons';
import { useAppStore } from '../../stores/appStore';
import { useTables, useTableMatch, useReservations, useOpenSessions, useWalkin, useSettle, useCreateReservation, useCheckin, useCancelReservation } from '../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { formatTime, formatDurationFrom, formatDateTime, areaTypeText, toMysqlDatetime, yuan } from '../../utils/format';
import dayjs from 'dayjs';

const statusColor: Record<string, string> = { idle: '#52c41a', reserved: '#faad14', occupied: '#ff4d4f' };

export const TablesPage: React.FC = () => {
  const qc = useQueryClient();
  const { data: tables = [] } = useTables();
  const { data: sessions = [] } = useOpenSessions();
  const { data: reservations = [] } = useReservations();
  const walkin = useWalkin();
  const settle = useSettle();
  const createReservation = useCreateReservation();
  const checkin = useCheckin();
  const cancel = useCancelReservation();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [guestName, setGuestName] = useState('访客');
  const [guestPhone, setGuestPhone] = useState('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [partySize, setPartySize] = useState(4);
  const [startAt, setStartAt] = useState(dayjs());
  const [endAt, setEndAt] = useState(dayjs().add(2, 'hour'));
  const [billedMin, setBilledMin] = useState(90);
  const [amountYuan, setAmountYuan] = useState(48);
  const [matchEnabled, setMatchEnabled] = useState(false);
  const [closedSessionId, setClosedSessionId] = useState('');

  const { data: matches = [] } = useTableMatch(partySize, toMysqlDatetime(startAt.toDate()), toMysqlDatetime(endAt.toDate()), matchEnabled);

  const selected = tables.find(t => t.id === selectedId) || null;
  const selectedSession = useMemo(() => {
    if (!selectedId) return null;
    return sessions.find(s => s.tableId === selectedId) || null;
  }, [selectedId, sessions]);

  const selectedReservations = useMemo(() => {
    if (!selectedId) return [];
    return reservations
      .filter(r => r.tableId === selectedId && r.status === 'pending')
      .sort((a, b) => new Date(a.reservedStart).getTime() - new Date(b.reservedStart).getTime());
  }, [selectedId, reservations]);

  const players = useAppStore(s => s.players);
  const games = useAppStore(s => s.games);

  const handleWalkin = async () => {
    if (!selectedId) return;
    try {
      await walkin.mutateAsync({ tableId: selectedId, guestName, guestPhone, partySize });
      message.success('现场开台成功');
    } catch (e: any) { message.error(e.message); }
  };

  const handleReserve = async () => {
    if (!selectedId) return;
    try {
      await createReservation.mutateAsync({
        tableId: selectedId, playerId, guestName, guestPhone, partySize,
        reservedStart: toMysqlDatetime(startAt.toDate()), reservedEnd: toMysqlDatetime(endAt.toDate()),
      });
      message.success('预约已创建');
    } catch (e: any) { message.error(e.message); }
  };

  const handleSettle = async () => {
    if (!selectedSession) return;
    try {
      await settle.mutateAsync({
        id: selectedSession.id, billedMinutes: billedMin, amountCents: Math.round(amountYuan * 100),
      });
      setClosedSessionId(String(selectedSession.id));
      message.success('已结算关台');
    } catch (e: any) { message.error(e.message); }
  };

  const handleCheckin = async (id: number) => {
    try {
      await checkin.mutateAsync(id);
      message.success('已入场开台');
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async (id: number) => {
    Modal.confirm({
      title: '确定取消该预约？', content: '取消后不可恢复，桌位将被释放。',
      onOk: async () => {
        try { await cancel.mutateAsync(id); message.success('已取消'); } catch (e: any) { message.error(e.message); }
      },
    });
  };

  const cols = Math.max(...tables.map(t => t.posX || 0)) + 1;

  return (
    <Row gutter={16}>
      <Col span={14}>
        <Card title="桌位平面图" extra={
          <Space>
            <Badge status="success" text="空闲" />
            <Badge status="warning" text="预约" />
            <Badge status="error" text="占用" />
          </Space>
        }>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, minHeight: 300 }}>
            {tables.map(t => {
              const sess = sessions.find(s => s.tableId === t.id);
              const pending = reservations.filter(r => r.tableId === t.id && r.status === 'pending')[0];
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    padding: 14, borderRadius: 8, border: `2px solid ${selectedId === t.id ? '#1677ff' : statusColor[t.status]}`,
                    background: t.status === 'idle' ? '#f6ffed' : t.status === 'reserved' ? '#fffbe6' : '#fff2f0',
                    cursor: 'pointer', minHeight: 100,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: 18 }}>{t.code}</strong><Tag color={t.status === 'idle' ? 'green' : t.status === 'reserved' ? 'gold' : 'red'}>{t.status === 'idle' ? '空闲' : t.status === 'reserved' ? '已预约' : '占用中'}</Tag></div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{t.seatCapacity}人桌 · {areaTypeText(t.areaType)}</div>
                  {sess && <div style={{ fontSize: 12, marginTop: 4 }}>⏱ {sess.guestName} · {sess.partySize}人 · {formatDurationFrom(sess.startedAt)}</div>}
                  {!sess && pending && <div style={{ fontSize: 12, marginTop: 4 }}>📋 {pending.guestName} · {pending.partySize}人</div>}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Match results */}
        {matchEnabled && matches.length > 0 && (
          <Card title="桌位匹配结果" size="small" style={{ marginTop: 16 }}>
            <List dataSource={matches} renderItem={item => (
              <List.Item extra={<Tag color="blue">{item.score.toFixed(1)}分</Tag>}>
                <List.Item.Meta
                  title={<span style={{ cursor: 'pointer' }} onClick={() => setSelectedId(item.tableId)}>{item.code}</span>}
                  description={`${item.seatCapacity}人 · ${areaTypeText(item.areaType)} · ${item.reason}`}
                />
              </List.Item>
            )} />
          </Card>
        )}
      </Col>

      <Col span={10}>
        {!selected ? (
          <Empty description="点击左侧桌位以进行操作" />
        ) : (
          <>
            <Card title={`桌位 ${selected.code}`} size="small">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="状态"><Badge status="processing" text={selected.status === 'idle' ? '空闲' : selected.status === 'reserved' ? '已预约' : '占用中'} /></Descriptions.Item>
                <Descriptions.Item label="容量">{selected.seatCapacity}人</Descriptions.Item>
                <Descriptions.Item label="区域">{areaTypeText(selected.areaType)}</Descriptions.Item>
                <Descriptions.Item label="当前开台">{selectedSession ? `#${selectedSession.id}` : '无'}</Descriptions.Item>
              </Descriptions>
              <Space style={{ marginTop: 8 }}>
                <Button icon={<PlayCircleOutlined />} type="primary" disabled={selected.status === 'occupied'} onClick={handleWalkin}>现场开台</Button>
                <Button onClick={() => { setMatchEnabled(true); qc.invalidateQueries({ queryKey: ['tables', 'match'] }); }} icon={<SearchOutlined />}>匹配桌位</Button>
              </Space>
            </Card>

            {/* Reservation queue */}
            {selectedReservations.length > 0 && (
              <Card title="预约队列" size="small" style={{ marginTop: 12 }}>
                {selectedReservations.map((r, i) => (
                  <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div><strong>#{r.id}</strong> <Tag>第{i + 1}组</Tag> <Tag color="blue">{r.partySize}人</Tag></div>
                    <div style={{ fontSize: 12, color: '#666' }}>{r.guestName} · {formatTime(r.reservedStart)}</div>
                    <Space style={{ marginTop: 4 }}>
                      <Button size="small" type="primary" onClick={() => handleCheckin(r.id)}>入场</Button>
                      <Button size="small" danger onClick={() => handleCancel(r.id)}>取消</Button>
                    </Space>
                  </div>
                ))}
              </Card>
            )}

            {/* New reservation form */}
            <Card title="新建预约" size="small" style={{ marginTop: 12 }}>
              <Input placeholder="称呼" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ marginBottom: 8 }} />
              <Input placeholder="联系电话" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} style={{ marginBottom: 8 }} />
              <Select style={{ width: '100%', marginBottom: 8 }} placeholder="会员（可选）" allowClear value={playerId} onChange={v => setPlayerId(v)} options={players.map(p => ({ value: p.id, label: p.displayName }))} />
              <InputNumber min={1} max={20} value={partySize} onChange={v => setPartySize(v || 4)} style={{ width: '100%', marginBottom: 8 }} addonBefore="人数" />
              <DatePicker showTime value={startAt} onChange={v => v && setStartAt(v)} style={{ width: '100%', marginBottom: 8 }} placeholder="开始时间" />
              <DatePicker showTime value={endAt} onChange={v => v && setEndAt(v)} style={{ width: '100%', marginBottom: 8 }} placeholder="结束时间" />
              <Button type="primary" block onClick={handleReserve} loading={createReservation.isPending}>提交预约</Button>
            </Card>

            {/* Settlement */}
            {selectedSession && (
              <Card title="结算关台" size="small" style={{ marginTop: 12 }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="对局">#{selectedSession.id}</Descriptions.Item>
                  <Descriptions.Item label="进行">{formatDurationFrom(selectedSession.startedAt)}</Descriptions.Item>
                </Descriptions>
                <InputNumber min={1} value={billedMin} onChange={v => setBilledMin(v || 90)} style={{ width: '100%', marginBottom: 8 }} addonBefore="计费(分钟)" />
                <InputNumber min={0} step={0.01} value={amountYuan} onChange={v => setAmountYuan(v || 0)} style={{ width: '100%', marginBottom: 8 }} addonBefore="金额(元)" prefix="¥" />
                <Button type="primary" danger block onClick={handleSettle} loading={settle.isPending}>结算关台</Button>
              </Card>
            )}
          </>
        )}
      </Col>
    </Row>
  );
};
