import React, { useState } from 'react';
import { Row, Col, Card, Table, Button, Input, Select, Tag, Descriptions, message, Modal, Space } from 'antd';
import { PlusOutlined, KeyOutlined, StopOutlined } from '@ant-design/icons';
import { useStaff } from '../../hooks/useQueries';
import { staffApi } from '../../services/endpoints';
import { useIsAdmin, useAppStore } from '../../stores/appStore';
import type { StaffProfile } from '../../types';
import { useQueryClient } from '@tanstack/react-query';

export const StaffPage: React.FC = () => {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StaffProfile | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPosition, setNewPosition] = useState('店员');
  const [accUsername, setAccUsername] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accRole, setAccRole] = useState('staff');

  const { data: staff = [] } = useStaff(search || undefined);

  const columns = [
    { title: '姓名', dataIndex: 'fullName', render: (v: string) => <strong>{v}</strong> },
    { title: '员工号', dataIndex: 'employeeNo', width: 120 },
    { title: '手机', dataIndex: 'phone', render: (v: string) => v || '-' },
    { title: '岗位', dataIndex: 'position' },
    { title: '后台账号', dataIndex: 'username', render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : <Tag>未开通</Tag> },
    { title: '状态', dataIndex: 'status', render: (s: string) => s === 'active' ? <Tag color="green">在职</Tag> : <Tag color="default">已停用</Tag> },
  ];

  const handleCreate = async () => {
    try {
      const result = await staffApi.create({ fullName: newName, phone: newPhone, position: newPosition });
      message.success(`员工已创建：${result.data.employeeNo}`);
      setNewName(''); setNewPhone(''); qc.invalidateQueries({ queryKey: ['staff'] });
    } catch (e: any) { message.error(e.message); }
  };

  const handleCreateAccount = async () => {
    if (!selected) return;
    try {
      await staffApi.createAccount(selected.id, { username: accUsername, password: accPassword, role: accRole });
      message.success('后台账号已创建');
      setAccUsername(''); setAccPassword('');
      qc.invalidateQueries({ queryKey: ['staff'] });
    } catch (e: any) { message.error(e.message); }
  };

  const handleDisable = () => {
    if (!selected) return;
    const currentUser = useAppStore.getState().currentUser;
    if (currentUser?.staffId === selected.id) { message.error('不能停用当前登录员工'); return; }
    Modal.confirm({
      title: '确定停用？', onOk: async () => {
        try { await staffApi.disable(selected.id); setSelected(null); message.success('已停用'); qc.invalidateQueries({ queryKey: ['staff'] }); } catch (e: any) { message.error(e.message); }
      },
    });
  };

  return (
    <Row gutter={16}>
      <Col span={14}>
        <Card title="员工管理" extra={<Input.Search placeholder="搜索姓名/手机/员工号/账号" onSearch={setSearch} allowClear style={{ width: 280 }} />}>
          <Table
            dataSource={staff} columns={columns} rowKey="id" size="small"
            onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer', background: selected?.id === r.id ? '#e6f4ff' : undefined } })}
            pagination={{ pageSize: 15 }}
          />
        </Card>
      </Col>
      <Col span={10}>
        {selected ? (
          <>
            <Card>
              <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
                <Descriptions.Item label="员工号">{selected.employeeNo}</Descriptions.Item>
                <Descriptions.Item label="姓名">{selected.fullName}</Descriptions.Item>
                <Descriptions.Item label="手机">{selected.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="岗位">{selected.position}</Descriptions.Item>
                <Descriptions.Item label="账号">{selected.username || '未开通'}</Descriptions.Item>
                <Descriptions.Item label="角色">{selected.role || '-'}</Descriptions.Item>
              </Descriptions>
              {isAdmin && <Button danger icon={<StopOutlined />} onClick={handleDisable}>停用员工</Button>}
            </Card>

            {isAdmin && !selected.username && (
              <Card title="创建后台账号" style={{ marginTop: 16 }}>
                <Input placeholder="登录账号" value={accUsername} onChange={e => setAccUsername(e.target.value)} style={{ marginBottom: 8 }} />
                <Input.Password placeholder="初始密码" value={accPassword} onChange={e => setAccPassword(e.target.value)} style={{ marginBottom: 8 }} />
                <Select value={accRole} onChange={v => setAccRole(v)} style={{ width: '100%', marginBottom: 8 }}>
                  <Select.Option value="staff">店员</Select.Option>
                  <Select.Option value="admin">管理员</Select.Option>
                </Select>
                <Button type="primary" block onClick={handleCreateAccount} icon={<KeyOutlined />}>创建账号</Button>
              </Card>
            )}

            {isAdmin && (
              <Card title="新增员工" style={{ marginTop: 16 }}>
                <Input placeholder="姓名" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: 8 }} />
                <Input placeholder="手机号" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ marginBottom: 8 }} />
                <Input placeholder="岗位" value={newPosition} onChange={e => setNewPosition(e.target.value)} style={{ marginBottom: 8 }} />
                <Button type="primary" block onClick={handleCreate} icon={<PlusOutlined />}>新增员工档案</Button>
              </Card>
            )}
          </>
        ) : (
          <Card><div style={{ textAlign: 'center', color: '#999' }}>选择左侧员工查看详情</div></Card>
        )}
      </Col>
    </Row>
  );
};
