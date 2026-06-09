import React, { useState } from 'react';
import { Card, Table, Tag, Button, message, Select, Input } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useReservations, useOpenSessions, useCheckin, useCancelReservation } from '../../hooks/useQueries';
import { formatTime, formatDurationFrom } from '../../utils/format';

export const SessionsPage: React.FC = () => {
  const { data: reservations = [] } = useReservations();
  const { data: sessions = [] } = useOpenSessions();
  const checkin = useCheckin();
  const cancel = useCancelReservation();

  const pendingRes = reservations.filter(r => r.status === 'pending');

  return (
    <div>
      <Card title="待处理预约" style={{ marginBottom: 16 }}>
        <Table
          dataSource={pendingRes} rowKey="id" size="small" pagination={{ pageSize: 10 }}
          columns={[
            { title: '#', dataIndex: 'id', width: 60 },
            { title: '桌位', dataIndex: 'tableCode', width: 80 },
            { title: '预约人', dataIndex: 'guestName' },
            { title: '会员', dataIndex: 'playerName', render: (v: string) => v || '-' },
            { title: '人数', dataIndex: 'partySize', width: 60 },
            { title: '时间', render: (_: any, r: any) => `${formatTime(r.reservedStart)} — ${formatTime(r.reservedEnd)}`, width: 200 },
            { title: '操作', width: 160, render: (_: any, r: any) => (
              <>
                <Button size="small" type="primary" onClick={async () => { try { await checkin.mutateAsync(r.id); message.success('已入场'); } catch(e:any){message.error(e.message);} }}>入场</Button>
                <Button size="small" danger style={{ marginLeft: 4 }} onClick={async () => { try { await cancel.mutateAsync(r.id); message.success('已取消'); } catch(e:any){message.error(e.message);} }}>取消</Button>
              </>
            )},
          ]}
        />
      </Card>

      <Card title="进行中对局">
        <Table
          dataSource={sessions} rowKey="id" size="small" pagination={false}
          columns={[
            { title: 'Session', dataIndex: 'id', width: 60 },
            { title: '桌位', dataIndex: 'tableCode', width: 80 },
            { title: '客人', dataIndex: 'guestName' },
            { title: '会员', dataIndex: 'playerName', render: (v: string) => v || '-' },
            { title: '人数', dataIndex: 'partySize', width: 60 },
            { title: '开台', dataIndex: 'startedAt', render: (v: string) => formatTime(v), width: 160 },
            { title: '已进行', dataIndex: 'startedAt', render: (v: string) => <Tag color="processing">{formatDurationFrom(v)}</Tag>, width: 100 },
          ]}
        />
      </Card>
    </div>
  );
};
