package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/keainya/work_trace/object"
	"github.com/keainya/work_trace/utils"
)

type Response struct {
	Code int64  `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data"`
}

// ---------- 工具函数 ----------

func getUserID(c *gin.Context) string {
	id, _ := c.Get("user_id")
	return id.(string)
}

func ok(data any) Response {
	return Response{Code: 0, Msg: "ok", Data: data}
}

func fail(code int64, msg string) Response {
	return Response{Code: code, Msg: msg, Data: nil}
}

// ---------- 工作记录（内部使用） ----------

func addWorkRecord(itemID, action, detail string) {
	object.Database.Create(&object.WorkRecord{
		ID:         uuid.New().String(),
		WorkItemID: itemID,
		Action:     action,
		Detail:     detail,
		CreatedAt:  time.Now(),
	})
}

func diffDesc(old, new *object.WorkItem, action string) string {
	switch action {
	case "create":
		desc := fmt.Sprintf("创建了工作项「%s」", new.Title)
		if new.StartTime != nil {
			desc += "；开始时间: " + formatTimeStr(new.StartTime)
		}
		if new.EndTime != nil {
			desc += "；结束时间: " + formatTimeStr(new.EndTime)
		}
		return desc
	case "update":
		parts := []string{}
		if old.Title != new.Title {
			parts = append(parts, fmt.Sprintf("标题: 「%s」→「%s」", old.Title, new.Title))
		}
		if old.Detail != new.Detail {
			parts = append(parts, "详细说明: "+truncate(new.Detail, 200))
		}
		if !timePtrEqual(old.StartTime, new.StartTime) {
			parts = append(parts, "开始时间: "+formatTimeDiff(old.StartTime, new.StartTime))
		}
		if !timePtrEqual(old.EndTime, new.EndTime) {
			parts = append(parts, "结束时间: "+formatTimeDiff(old.EndTime, new.EndTime))
		}
		if !timePtrEqual(old.RemindAt, new.RemindAt) {
			parts = append(parts, "提醒时间: "+formatTimeDiff(old.RemindAt, new.RemindAt))
		}
		if len(parts) == 0 {
			parts = append(parts, "更新了工作项")
		}
		return joinParts(parts)
	case "complete":
		return fmt.Sprintf("标记工作项「%s」为已完成", new.Title)
	case "uncomplete":
		return fmt.Sprintf("标记工作项「%s」为未完成", new.Title)
	default:
		return action
	}
}

func formatTimeStr(t *time.Time) string {
	if t == nil {
		return "(未设置)"
	}
	return t.Format("2006-01-02 15:04")
}

func formatTimeDiff(old, new *time.Time) string {
	oldStr := "(未设置)"
	newStr := "(未设置)"
	if old != nil {
		oldStr = old.Format("2006-01-02 15:04")
	}
	if new != nil {
		newStr = new.Format("2006-01-02 15:04")
	}
	return fmt.Sprintf("%s → %s", oldStr, newStr)
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}

func timePtrEqual(a, b *time.Time) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return a.Equal(*b)
}

func joinParts(parts []string) string {
	s := ""
	for i, p := range parts {
		if i > 0 {
			s += "；"
		}
		s += p
	}
	return s
}

func parseTimePtr(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02T15:04", s)
	if err != nil {
		return nil
	}
	return &t
}

// ---------- 工作项 API ----------

type workItemInput struct {
	Title     string `json:"title"`
	Detail    string `json:"detail"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	RemindAt  string `json:"remind_at"`
}

// ListWorkItems 获取工作项列表
func ListWorkItems(c *gin.Context) {
	userID := getUserID(c)

	var items []object.WorkItem
	status := c.Query("status") // all / completed / active
	query := object.Database.Where("user_id = ?", userID)
	if status == "completed" {
		query = query.Where("completed = ?", true)
	} else if status == "active" {
		query = query.Where("completed = ?", false)
	}

	// 搜索
	if keyword := c.Query("search"); keyword != "" {
		query = query.Where("title LIKE ?", "%"+keyword+"%")
	}

	// 排序：未完成优先，再按更新时间倒序
	query = query.Order("completed ASC")
	sortBy := c.DefaultQuery("sort", "updated_at")
	order := c.DefaultQuery("order", "desc")
	query = query.Order(sortBy + " " + order)

	query.Find(&items)

	// 附带子任务计数
	type itemWithCount struct {
		object.WorkItem
		TotalSubTasks    int64 `json:"total_sub_tasks"`
		CompletedSubTasks int64 `json:"completed_sub_tasks"`
	}
	result := make([]itemWithCount, len(items))
	for i, item := range items {
		result[i].WorkItem = item
		object.Database.Model(&object.SubTask{}).Where("work_item_id = ?", item.ID).Count(&result[i].TotalSubTasks)
		object.Database.Model(&object.SubTask{}).Where("work_item_id = ? AND completed = ?", item.ID, true).Count(&result[i].CompletedSubTasks)
	}

	c.JSON(http.StatusOK, ok(result))
}

// GetWorkItem 获取单个工作项
func GetWorkItem(c *gin.Context) {
	userID := getUserID(c)
	id := c.Param("id")

	var item object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	c.JSON(http.StatusOK, ok(item))
}

// CreateWorkItem 创建工作项
func CreateWorkItem(c *gin.Context) {
	userID := getUserID(c)

	var input workItemInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, fail(1002, "参数校验失败"))
		return
	}
	if input.Title == "" {
		c.JSON(http.StatusBadRequest, fail(1002, "标题不能为空"))
		return
	}

	now := time.Now()
	item := object.WorkItem{
		ID:        uuid.New().String(),
		UserID:    userID,
		Title:     input.Title,
		Detail:    input.Detail,
		StartTime: parseTimePtr(input.StartTime),
		EndTime:   parseTimePtr(input.EndTime),
		RemindAt:  parseTimePtr(input.RemindAt),
		CreatedAt: now,
		UpdatedAt: now,
	}

	object.Database.Create(&item)
	addWorkRecord(item.ID, "create", diffDesc(nil, &item, "create"))

	c.JSON(http.StatusCreated, ok(item))
}

// UpdateWorkItem 更新工作项
func UpdateWorkItem(c *gin.Context) {
	userID := getUserID(c)
	id := c.Param("id")

	var old object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", id, userID).First(&old).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var input workItemInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, fail(1002, "参数校验失败"))
		return
	}

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	if input.Detail != "" || input.Detail == old.Detail {
		// 允许清空
		updates["detail"] = input.Detail
	}
	updates["start_time"] = parseTimePtr(input.StartTime)
	updates["end_time"] = parseTimePtr(input.EndTime)
	updates["remind_at"] = parseTimePtr(input.RemindAt)

	object.Database.Model(&old).Updates(updates)

	// 获取更新后的对象用于 diff
	var updated object.WorkItem
	object.Database.First(&updated, "id = ?", id)
	addWorkRecord(id, "update", diffDesc(&old, &updated, "update"))

	c.JSON(http.StatusOK, ok(updated))
}

// ToggleComplete 切换完成状态
func ToggleComplete(c *gin.Context) {
	userID := getUserID(c)
	id := c.Param("id")

	var item object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	newCompleted := !item.Completed
	object.Database.Model(&item).Updates(map[string]interface{}{
		"completed":  newCompleted,
		"updated_at": time.Now(),
	})

	action := "complete"
	if !newCompleted {
		action = "uncomplete"
	}
	addWorkRecord(id, action, diffDesc(nil, &item, action))

	c.JSON(http.StatusOK, ok(gin.H{"completed": newCompleted}))
}

// DeleteWorkItem 删除工作项
func DeleteWorkItem(c *gin.Context) {
	userID := getUserID(c)
	id := c.Param("id")

	var item object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	object.Database.Delete(&item) // 级联删除子任务和工作记录
	c.JSON(http.StatusOK, ok(nil))
}

// ---------- 子任务 API ----------

type subTaskInput struct {
	Content   string `json:"content"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	RemindAt  string `json:"remind_at"`
}

// ListSubTasks 获取某工作项下的子任务列表
func ListSubTasks(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")

	// 验证工作项归属
	var item object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var subTasks []object.SubTask
	object.Database.Where("work_item_id = ?", workItemID).Order("created_at asc").Find(&subTasks)
	c.JSON(http.StatusOK, ok(subTasks))
}

// CreateSubTask 创建子任务
func CreateSubTask(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")

	var item object.WorkItem
	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var input subTaskInput
	if err := c.ShouldBindJSON(&input); err != nil || input.Content == "" {
		c.JSON(http.StatusBadRequest, fail(1002, "内容不能为空"))
		return
	}

	now := time.Now()
	sub := object.SubTask{
		ID:         uuid.New().String(),
		WorkItemID: workItemID,
		Content:    input.Content,
		StartTime:  parseTimePtr(input.StartTime),
		EndTime:    parseTimePtr(input.EndTime),
		RemindAt:   parseTimePtr(input.RemindAt),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	object.Database.Create(&sub)

	addWorkRecord(workItemID, "update", fmt.Sprintf("添加了子任务「%s」", sub.Content))

	c.JSON(http.StatusCreated, ok(sub))
}

// UpdateSubTask 更新子任务
func UpdateSubTask(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")
	subTaskID := c.Param("sub_id")

	// 验证工作项归属
	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&object.WorkItem{}).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var sub object.SubTask
	if err := object.Database.Where("id = ? AND work_item_id = ?", subTaskID, workItemID).First(&sub).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4005, "子任务不存在"))
		return
	}

	var input subTaskInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, fail(1002, "参数校验失败"))
		return
	}

	// 保存旧值用于 diff
	oldContent := sub.Content

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if input.Content != "" {
		updates["content"] = input.Content
	}
	updates["start_time"] = parseTimePtr(input.StartTime)
	updates["end_time"] = parseTimePtr(input.EndTime)
	updates["remind_at"] = parseTimePtr(input.RemindAt)

	object.Database.Model(&sub).Updates(updates)
	object.Database.First(&sub, "id = ?", subTaskID)

	// 记录子任务更新
	parts := []string{}
	if input.Content != "" && input.Content != oldContent {
		parts = append(parts, fmt.Sprintf("内容: 「%s」→「%s」", oldContent, input.Content))
	}
	if input.StartTime != "" || input.EndTime != "" || input.RemindAt != "" {
		parts = append(parts, "调整了时间/提醒")
	}
	if len(parts) > 0 {
		addWorkRecord(workItemID, "update", fmt.Sprintf("更新了子任务: %s", joinParts(parts)))
	}

	c.JSON(http.StatusOK, ok(sub))
}

// ToggleSubTaskComplete 切换子任务完成状态
func ToggleSubTaskComplete(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")
	subTaskID := c.Param("sub_id")

	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&object.WorkItem{}).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var sub object.SubTask
	if err := object.Database.Where("id = ? AND work_item_id = ?", subTaskID, workItemID).First(&sub).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4005, "子任务不存在"))
		return
	}

	newCompleted := !sub.Completed
	object.Database.Model(&sub).Updates(map[string]interface{}{
		"completed":  newCompleted,
		"updated_at": time.Now(),
	})

	if newCompleted {
		addWorkRecord(workItemID, "update", fmt.Sprintf("子任务「%s」标记为已完成", sub.Content))
	} else {
		addWorkRecord(workItemID, "update", fmt.Sprintf("子任务「%s」取消完成", sub.Content))
	}

	c.JSON(http.StatusOK, ok(gin.H{"completed": newCompleted}))
}

// DeleteSubTask 删除子任务
func DeleteSubTask(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")
	subTaskID := c.Param("sub_id")

	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&object.WorkItem{}).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var sub object.SubTask
	if err := object.Database.Where("id = ? AND work_item_id = ?", subTaskID, workItemID).First(&sub).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4005, "子任务不存在"))
		return
	}

	object.Database.Delete(&sub)
	addWorkRecord(workItemID, "update", fmt.Sprintf("删除了子任务「%s」", sub.Content))

	c.JSON(http.StatusOK, ok(nil))
}

// ---------- 工作记录 API ----------

// ListWorkRecords 获取工作记录（懒加载，默认展开时才请求）
func ListWorkRecords(c *gin.Context) {
	userID := getUserID(c)
	workItemID := c.Param("id")

	// 验证归属
	if err := object.Database.Where("id = ? AND user_id = ?", workItemID, userID).First(&object.WorkItem{}).Error; err != nil {
		c.JSON(http.StatusNotFound, fail(4004, "工作项不存在"))
		return
	}

	var records []object.WorkRecord
	object.Database.Where("work_item_id = ?", workItemID).Order("created_at desc").Find(&records)
	c.JSON(http.StatusOK, ok(records))
}

// ---------- 状态 --------

func Status(c *gin.Context) {
	c.JSON(http.StatusOK, ok(gin.H{"service": "work_trace", "time": time.Now().Format(time.RFC3339)}))
}

// ---------- OAuth 配置（前端需要） ----------

type OAuthConfig struct {
	AuthURL     string `json:"authorize_url"`
	TokenURL    string `json:"token_url"`
	UserInfoURL string `json:"userinfo_url"`
	ClientID    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
}

func GetOAuthConfig(c *gin.Context) {
	config := OAuthConfig{
		AuthURL:     utils.Config.AccountBaseURL + "/oauth/authorize",
		TokenURL:    utils.Config.AccountBaseURL + "/oauth/token",
		UserInfoURL: utils.Config.AccountBaseURL + "/oauth/userinfo",
		ClientID:    utils.Config.ClientID,
		RedirectURI: getRedirectURI(c),
	}
	c.JSON(http.StatusOK, ok(config))
}

// ExchangeToken 代理 token 交换（保护 client_secret 不暴露到前端）
// 支持 authorization_code 和 refresh_token 两种 grant_type
type tokenExchangeInput struct {
	GrantType    string `json:"grant_type"`    // "authorization_code" 或 "refresh_token"
	Code         string `json:"code"`          // authorization_code 时使用
	RefreshToken string `json:"refresh_token"` // refresh_token 时使用
	RedirectURI  string `json:"redirect_uri"`  // authorization_code 时使用
}

func ExchangeToken(c *gin.Context) {
	var input tokenExchangeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, fail(1002, "参数校验失败"))
		return
	}

	if input.GrantType == "" {
		// 兼容旧版：默认 authorization_code
		input.GrantType = "authorization_code"
	}

	form := map[string][]string{
		"grant_type":    {input.GrantType},
		"client_id":     {utils.Config.ClientID},
		"client_secret": {utils.Config.ClientSecret},
	}

	switch input.GrantType {
	case "authorization_code":
		if input.Code == "" {
			c.JSON(http.StatusBadRequest, fail(1002, "缺少授权码"))
			return
		}
		form["code"] = []string{input.Code}
		form["redirect_uri"] = []string{input.RedirectURI}
	case "refresh_token":
		if input.RefreshToken == "" {
			c.JSON(http.StatusBadRequest, fail(1002, "缺少 refresh_token"))
			return
		}
		form["refresh_token"] = []string{input.RefreshToken}
	default:
		c.JSON(http.StatusBadRequest, fail(3006, "不支持的 grant_type"))
		return
	}

	resp, err := http.PostForm(utils.Config.AccountBaseURL+"/oauth/token", form)
	if err != nil {
		c.JSON(http.StatusInternalServerError, fail(9000, "token 交换失败"))
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if result["access_token"] == nil {
		c.JSON(http.StatusBadRequest, fail(3004, "授权码无效或已过期"))
		return
	}

	c.JSON(http.StatusOK, ok(result))
}

func getRedirectURI(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host + "/oauth/callback"
}
