import React, { useState } from 'react';
import { Row, Col, Card, Table, Button, Input, InputNumber, Modal, Tag, Avatar, Descriptions, Divider, message, Space } from 'antd';
import { PlusOutlined, WalletOutlined, StopOutlined } from '@ant-design/icons';
import { useMembers, useMemberReservations, useCreateMember, useMemberRecharge, useMemberConsume, useDisableMember } from '../../hooks/useQueries';
import { yuan, formatTime } from '../../utils/format';
import type { Player } from '../../types';

export const MembersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Player | null>(null);
  const [amountYuan, setAmountYuan] = useState(100);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBalance, setNewBalance] = useState(100);

  const { data: members = [] } = useMembers(search || undefined);
  const { data: memberReservations = [] } = useMemberReservations(selected?.id || null);
  const createMember = useCreateMember();
  const recharge = useMemberRecharge();
  const consume = useMemberConsume();
  const disable = useDisableMember();

  const columns = [
    { title: '头像', dataIndex: 'avatarUrl', width: 64, render: (v: string, r: Player) => <Avatar src={v || `https://i.pravatar.cc/64?u=${r.id}`} /> },
    { title: '会员号', dataIndex: 'memberNo', width: 120 },
    { title: '姓名', dataIndex: 'displayName' },
    { title: '手机', dataIndex: 'phone', render: (v: string) => v || '-' },
    { title: '余额', dataIndex: 'balanceCents', render: (v: number) => yuan(v) },
    { title: '状态', dataIndex: 'status', render: (s: string) => s === 'active' ? <Tag color="green">正常</Tag> : <Tag color="default">已停用</Tag> },
  ];

  const handleRecharge = async () => {
    if (!selected) return;
    try { await recharge.mutateAsync({ id: selected.id, amountYuan }); message.success('充值成功'); } catch (e: any) { message.error(e.message); }
  };
  const handleConsume = async () => {
    if (!selected) return;
    try { await consume.mutateAsync({ id: selected.id, amountYuan }); message.success('扣费成功'); } catch (e: any) { message.error(e.message); }
  };
  const handleDisable = () => {
    if (!selected) return;
    Modal.confirm({
      title: '确定停用该会员？', onOk: async () => {
        try { await disable.mutateAsync(selected.id); setSelected(null); message.success('已停用'); } catch (e: any) { message.error(e.message); }
      },
    });
  };
  const handleCreate = async () => {
    try {
      const result = await createMember.mutateAsync({ displayName: newName, phone: newPhone, initialBalanceYuan: newBalance });
      message.success(`会员已创建：${result.memberNo}`);
      setNewName(''); setNewPhone(''); setNewBalance(100);
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <Row gutter={16}>
      <Col span={14}>
        <Card title="会员管理" extra={<Input.Search placeholder="搜索姓名/手机/会员号" onSearch={setSearch} allowClear style={{ width: 280 }} />}>
          <Table
            dataSource={members} columns={columns} rowKey="id" size="small"
            onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer', background: selected?.id === record.id ? '#e6f4ff' : undefined } })}
            pagination={{ pageSize: 15 }}
          />
        </Card>
      </Col>
      <Col span={10}>
        {!selected ? (
          <Card><div style={{ textAlign: 'center', color: '#999' }}>选择左侧会员查看详情</div></Card>
        ) : (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <Avatar size={64} src={selected.avatarUrl} />
                <div>
                  <h3>{selected.displayName}</h3>
                  <div style={{ color: '#666' }}>{selected.memberNo} · {selected.phone || '无手机号'}</div>
                </div>
              </div>
              <Descriptions column={3} size="small">
                <Descriptions.Item label="余额">{yuan(selected.balanceCents)}</Descriptions.Item>
                <Descriptions.Item label="累计充值">{yuan(selected.totalRechargedCents)}</Descriptions.Item>
                <Descriptions.Item label="累计消费">{yuan(selected.totalSpentCents)}</Descriptions.Item>
              </Descriptions>
              <Divider />
              <InputNumber min={0} step={0.01} value={amountYuan} onChange={v => setAmountYuan(v || 0)} style={{ width: '100%', marginBottom: 8 }} addonBefore="金额(元)" />
              <Space>
                <Button icon={<WalletOutlined />} type="primary" onClick={handleRecharge} loading={recharge.isPending}>充值</Button>
                <Button icon={<WalletOutlined />} onClick={handleConsume} loading={consume.isPending}>扣费</Button>
                <Button icon={<StopOutlined />} danger onClick={handleDisable}>停用</Button>
              </Space>

              {memberReservations.length > 0 && (
                <>
                  <Divider /> <h4>预约记录 ({memberReservations.length}条)</h4>
                  {memberReservations.slice(0, 10).map(r => (
                    <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div><strong>#{r.id}</strong> <Tag>{r.status}</Tag></div>
                      <div style={{ fontSize: 12, color: '#666' }}>{r.tableCode} · {r.partySize}人 · {formatTime(r.reservedStart)}</div>
                    </div>
                  ))}
                </>
              )}
            </Card>

            <Card title="新增会员" style={{ marginTop: 16 }}>
              <Input placeholder="姓名" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: 8 }} />
              <Input placeholder="手机号" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ marginBottom: 8 }} />
              <InputNumber min={0} value={newBalance} onChange={v => setNewBalance(v || 0)} style={{ width: '100%', marginBottom: 8 }} addonBefore="初始余额(元)" />
              <Button type="primary" block onClick={handleCreate} loading={createMember.isPending}>新增会员</Button>
            </Card>
          </>
        )}
      </Col>
    </Row>
  );
};
