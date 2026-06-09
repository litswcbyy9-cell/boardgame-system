import React, { useState } from 'react';
import { Card, Form, Input, InputNumber, DatePicker, Button, List, Tag, message, Alert, Typography } from 'antd';
import { useTableMatch } from '../../hooks/useQueries';
import { reservationsApi } from '../../services/endpoints';
import { toMysqlDatetime, areaTypeText } from '../../utils/format';
import { useAppStore } from '../../stores/appStore';
import dayjs from 'dayjs';

const { Title } = Typography;

export const CustomerPage: React.FC = () => {
  const { venue } = useAppStore();
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(4);
  const [startAt, setStartAt] = useState(dayjs().add(1, 'hour'));
  const [endAt, setEndAt] = useState(dayjs().add(3, 'hour'));
  const [matchEnabled, setMatchEnabled] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [result, setResult] = useState<{ reservationId: number; tableCode?: string } | null>(null);

  const { data: matches = [] } = useTableMatch(
    partySize,
    toMysqlDatetime(startAt.toDate()),
    toMysqlDatetime(endAt.toDate()),
    matchEnabled,
  );

  const handleMatch = () => {
    if (!guestName || !phone) { message.warning('请填写姓名和电话'); return; }
    setMatchEnabled(true);
  };

  const handleSubmit = async () => {
    if (!guestName || !phone) { message.warning('请填写姓名和电话'); return; }
    try {
      const { data } = await reservationsApi.publicCreate({
        tableId: selectedTableId, guestName, guestPhone: phone, partySize,
        reservedStart: toMysqlDatetime(startAt.toDate()),
        reservedEnd: toMysqlDatetime(endAt.toDate()),
      });
      setResult(data);
      message.success(`预约已提交：${data.tableCode || '系统已分配桌位'}`);
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Title level={1} style={{ color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{venue?.name || '桌游门店'}</Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>在线预约桌位 · 无需登录</Typography.Text>
      </div>

      {result && (
        <Alert type="success" message={`预约已提交！预约号 #${result.reservationId}，桌位 ${result.tableCode || ''}`} showIcon style={{ marginBottom: 16 }} closable />
      )}

      <Card>
        <Form layout="vertical">
          <Form.Item label="姓名" required><Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="请输入姓名" /></Form.Item>
          <Form.Item label="联系电话" required><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="请输入联系电话" /></Form.Item>
          <Form.Item label="人数"><InputNumber min={1} max={20} value={partySize} onChange={v => setPartySize(v || 4)} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="到店时间"><DatePicker showTime value={startAt} onChange={v => v && setStartAt(v)} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="预计离店"><DatePicker showTime value={endAt} onChange={v => v && setEndAt(v)} style={{ width: '100%' }} /></Form.Item>
          <Button type="primary" block onClick={handleMatch} style={{ marginBottom: 12 }}>匹配可用桌位</Button>
        </Form>

        {matches.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4>可选桌位</h4>
            <List
              dataSource={matches}
              renderItem={item => (
                <List.Item
                  onClick={() => setSelectedTableId(item.tableId)}
                  style={{ cursor: 'pointer', background: selectedTableId === item.tableId ? '#e6f4ff' : undefined }}
                  extra={<Tag color="blue">{item.score.toFixed(1)}分</Tag>}
                >
                  <List.Item.Meta title={item.code} description={`${item.seatCapacity}人 · ${areaTypeText(item.areaType)} · ${item.reason}`} />
                </List.Item>
              )}
            />
            <Button type="primary" block onClick={handleSubmit}>
              {selectedTableId ? `预约 ${matches.find(m => m.tableId === selectedTableId)?.code || '选中桌位'}` : '自动分配并预约'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
