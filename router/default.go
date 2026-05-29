package router

import (
	"embed"
	"io/fs"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/keainya/service_temp/service"
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

	// ---- Session 中间件 ----
	store := cookie.NewStore([]byte("change-me-to-a-secure-random-key"))
	r.Use(sessions.Sessions("service_session", store))

	// ---- 嵌入式前端静态文件 (NoRoute 兜底) ----
	staticFS, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}
	r.NoRoute(gin.WrapH(http.FileServer(http.FS(staticFS))))

	// API 路由
	r.GET("/status", service.Status)
	r.GET("/session/set", service.SessionSet)
	r.GET("/session/get", service.SessionGet)
	r.GET("/session/del", service.SessionDel)

	return r
}
