package object

import (
	"os"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var Database *gorm.DB

// WorkItem 工作项
type WorkItem struct {
	ID          string     `json:"id" gorm:"primaryKey"`
	UserID      string     `json:"user_id" gorm:"index;not null"`
	Title       string     `json:"title" gorm:"not null"`
	Completed   bool       `json:"completed" gorm:"default:false"`
	Detail      string     `json:"detail"` // 详细说明（富文本）
	StartTime   *time.Time `json:"start_time"`
	EndTime     *time.Time `json:"end_time"`
	RemindAt    *time.Time `json:"remind_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	SubTasks    []SubTask    `json:"sub_tasks,omitempty" gorm:"foreignKey:WorkItemID;constraint:OnDelete:CASCADE"`
	WorkRecords []WorkRecord `json:"work_records,omitempty" gorm:"foreignKey:WorkItemID;constraint:OnDelete:CASCADE"`
}

// SubTask 子任务
type SubTask struct {
	ID         string     `json:"id" gorm:"primaryKey"`
	WorkItemID string     `json:"work_item_id" gorm:"index;not null"`
	Content    string     `json:"content" gorm:"not null"`
	Completed  bool       `json:"completed" gorm:"default:false"`
	StartTime  *time.Time `json:"start_time"`
	EndTime    *time.Time `json:"end_time"`
	RemindAt   *time.Time `json:"remind_at"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// WorkRecord 工作记录（编辑日志）
type WorkRecord struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	WorkItemID string    `json:"work_item_id" gorm:"index;not null"`
	Action     string    `json:"action"`                     // create / update / complete / uncomplete / delete
	Detail     string    `json:"detail"`                     // 变更描述
	CreatedAt  time.Time `json:"created_at"`
}

func init() {
	os.MkdirAll("data", 0755)
	var err error
	Database, err = gorm.Open(sqlite.Open("data/work_trace.db"), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	Database.AutoMigrate(&WorkItem{}, &SubTask{}, &WorkRecord{})
}
