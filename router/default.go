package router

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/keainya/work_trace/service"
	"github.com/keainya/work_trace/utils"
)

func InitRouter(webFS embed.FS) *gin.Engine {
	r := gin.New() // 不用 Default()，避免 RedirectTrailingSlash
	r.Use(gin.Recovery())

	// ---- CORS 中间件 ----
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	staticFS, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}

	// ---- API 根分组 ----
	api := r.Group("/api")
	{
		// 公开 API（无需认证）
		api.GET("/status", service.Status)
		api.GET("/oauth/config", service.GetOAuthConfig)
		api.POST("/oauth/token", service.ExchangeToken)
	}

	// 需要认证的 API（嵌套子分组，只对子路由添加 AuthMiddleware）
	auth := api.Group("")
	auth.Use(utils.AuthMiddleware())
	{
		auth.GET("/me", service.GetCurrentUser)
		auth.GET("/work-items", service.ListWorkItems)
		auth.POST("/work-items", service.CreateWorkItem)
		auth.GET("/work-items/:id", service.GetWorkItem)
		auth.PUT("/work-items/:id", service.UpdateWorkItem)
		auth.DELETE("/work-items/:id", service.DeleteWorkItem)
		auth.POST("/work-items/:id/toggle-complete", service.ToggleComplete)

		auth.GET("/work-items/:id/sub-tasks", service.ListSubTasks)
		auth.POST("/work-items/:id/sub-tasks", service.CreateSubTask)
		auth.PUT("/work-items/:id/sub-tasks/:sub_id", service.UpdateSubTask)
		auth.DELETE("/work-items/:id/sub-tasks/:sub_id", service.DeleteSubTask)
		auth.POST("/work-items/:id/sub-tasks/:sub_id/toggle", service.ToggleSubTaskComplete)

		auth.GET("/work-items/:id/records", service.ListWorkRecords)
	}

	// ---- 前端静态文件 & SPA 兜底 ----
	// 用 fs.ReadFile 直接读内容回写，完全避开 http.ServeFileFS 的目录重定向
	r.NoRoute(func(c *gin.Context) {
		// 只处理 GET/HEAD
		if c.Request.Method != "GET" && c.Request.Method != "HEAD" {
			c.Status(http.StatusMethodNotAllowed)
			return
		}

		upath := c.Request.URL.Path

		// API 路径不兜底
		if strings.HasPrefix(upath, "/api/") {
			c.JSON(http.StatusNotFound, service.Response{Code: 404, Msg: "not found"})
			return
		}

		name := strings.TrimPrefix(upath, "/")
		if name == "" {
			name = "index.html"
		}

		// 直接读文件内容，不走 http.FileSystem（避免重定向）
		data, readErr := fs.ReadFile(staticFS, name)
		if readErr != nil {
			// 文件不存在 → SPA 兜底到 index.html
			data, readErr = fs.ReadFile(staticFS, "index.html")
			if readErr != nil {
				c.Status(http.StatusNotFound)
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", data)
			return
		}

		// 根据扩展名设置 Content-Type
		ext := filepath.Ext(name)
		ct := mime.TypeByExtension(ext)
		if ct == "" {
			ct = "application/octet-stream"
		}
		c.Data(http.StatusOK, ct, data)
	})

	return r
}
