package router

import (
	"embed"
	"io/fs"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/keainya/work_trace/service"
	"github.com/keainya/work_trace/utils"
)

func InitRouter(webFS embed.FS) *gin.Engine {
	r := gin.Default()

	// ---- CORS 中间件 ----
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// ---- 嵌入式前端静态文件 ----
	staticFS, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}
	// 静态资源（css/js/ico 等）
	r.GET("/css/*filepath", func(c *gin.Context) {
		c.FileFromFS("css/"+c.Param("filepath"), http.FS(staticFS))
	})
	r.GET("/js/*filepath", func(c *gin.Context) {
		c.FileFromFS("js/"+c.Param("filepath"), http.FS(staticFS))
	})
	r.GET("/favicon.ico", func(c *gin.Context) {
		c.FileFromFS("favicon.ico", http.FS(staticFS))
	})

	// ---- 公开 API ----
	r.GET("/api/status", service.Status)
	r.GET("/api/oauth/config", service.GetOAuthConfig)
	r.POST("/api/oauth/token", service.ExchangeToken)

	// ---- 需要认证的 API ----
	auth := r.Group("/api")
	auth.Use(utils.AuthMiddleware())
	{
		// 工作项
		auth.GET("/work-items", service.ListWorkItems)
		auth.POST("/work-items", service.CreateWorkItem)
		auth.GET("/work-items/:id", service.GetWorkItem)
		auth.PUT("/work-items/:id", service.UpdateWorkItem)
		auth.DELETE("/work-items/:id", service.DeleteWorkItem)
		auth.POST("/work-items/:id/toggle-complete", service.ToggleComplete)

		// 子任务
		auth.GET("/work-items/:id/sub-tasks", service.ListSubTasks)
		auth.POST("/work-items/:id/sub-tasks", service.CreateSubTask)
		auth.PUT("/work-items/:id/sub-tasks/:sub_id", service.UpdateSubTask)
		auth.DELETE("/work-items/:id/sub-tasks/:sub_id", service.DeleteSubTask)
		auth.POST("/work-items/:id/sub-tasks/:sub_id/toggle", service.ToggleSubTaskComplete)

		// 工作记录（懒加载）
		auth.GET("/work-items/:id/records", service.ListWorkRecords)
	}

	// ---- SPA 兜底：非 API/静态资源 → index.html ----
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/" || path == "/index.html" {
			c.FileFromFS("index.html", http.FS(staticFS))
			return
		}
		// API 路径不兜底
		if len(path) >= 5 && path[:5] == "/api/" {
			c.JSON(http.StatusNotFound, service.Response{Code: 404, Msg: "not found"})
			return
		}
		c.FileFromFS("index.html", http.FS(staticFS))
	})

	return r
}
