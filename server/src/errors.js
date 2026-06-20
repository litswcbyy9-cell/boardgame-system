const ERROR_MESSAGES = {
    invalid_username: '账号只能包含字母、数字和下划线，长度 3-32 位',
    weak_password: '密码至少 6 位',
    username_exists: '账号已存在，请换一个账号名',
    registration_disabled: '公开注册已关闭，请由管理员在员工管理中创建账号',
    invalid_credentials: '账号或密码错误',
    unauthorized: '请先登录后再操作',
    forbidden: '当前账号没有执行该操作的权限',
    database_error: '数据库操作失败，请检查数据库连接或稍后重试',
    llm_error: '大模型调用失败，请检查 API Key 配置或稍后重试',
    copy_not_available: '该副本当前不可借出',
    copy_not_found: '桌游副本不存在',
    copy_lent: '该副本正在借出中，不能删除',
    loan_not_found: '借出记录不存在',
    loan_not_active: '该借出记录不是借出中状态',
    missing_staff_name: '员工姓名不能为空',
    staff_not_found: '员工不存在或已停用',
    employee_no_exists: '员工号已存在',
    staff_has_account: '该员工已经绑定后台账号',
    account_exists: '账号已存在，请换一个账号名',
    invalid_member_id: '会员编号不合法',
    missing_display_name: '会员姓名不能为空',
    invalid_amount: '金额必须大于 0',
    member_not_found: '会员不存在或已停用',
    insufficient_balance: '会员不存在或余额不足',
    invalid_player_id: '会员 ID 不合法',
    invalid_phone: '手机号格式不正确',
    phone_registered: '该手机号已经注册，请直接登录',
    invalid_time: '预约时间格式不合法',
    invalid_time_range: '结束时间必须晚于开始时间',
    missing_fields: '缺少必填字段，请补全后再提交',
    invalid_guest_name: '访客名称不能为空',
    invalid_party_size: '人数必须在 1 到 20 人之间',
    missing_tableId: '缺少桌位 ID',
    missing_gameId: '请选择要录入的桌游',
    table_not_found: '桌位不存在',
    table_occupied: '桌位正在占用中',
    time_overlap: '该时间段已有预约',
    capacity_exceeded: '预约人数超过该桌位容量，请选择更大桌位或包间',
    reserved_slot_active: '当前时间段已有待入场预约',
    no_table_available: '当前时间段没有容量合适的空闲桌位',
    reservation_not_found: '预约记录不存在',
    reservation_not_pending: '该预约不是待入场状态，不能入场',
    reservation_not_cancellable: '该预约已入场、取消或完成，不能再取消',
    session_not_open: '该对局不存在或已经结算，不能重复关台',
    session_not_started: '该预约尚未入场，暂时不能填写战绩',
    session_still_open: '该对局仍在进行中，请先结算关台再录入战绩',
    record_exists: '该预约已经提交过战绩',
    recording_moved_to_customer: '后台战绩录入已关闭，请由顾客在自己的预约记录中提交',
    game_not_found: '选择的桌游不存在',
};

export function errorMessage(code, fallback = '操作失败，请检查输入后重试') {
  return ERROR_MESSAGES[code] || fallback;
}

export function sendError(res, status, code, fallback) {
  const message = errorMessage(code, fallback);
  return res.status(status).json({ error: code, message, description: message });
}

export function reservationErrorMessage(code) {
  return errorMessage(code, '预约失败，请检查桌位、人数和时间后重试');
}
