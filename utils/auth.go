package utils

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const AccountBaseURL = "https://account.takemeto.icu"

// UserInfo Account 服务返回的用户信息
type UserInfo struct {
	Sub      string `json:"sub"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

// AuthMiddleware Bearer Token 认证中间件
// 从 Authorization header 提取 access_token，调用 Account 服务校验并获取用户信息
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code": 2001,
				"msg":  "未登录",
				"data": nil,
			})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")

		user, err := validateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code": 2001,
				"msg":  "token 无效或已过期",
				"data": nil,
			})
			return
		}

		// 存入 context，后续 handler 直接使用
		c.Set("user_id", user.Sub)
		c.Set("username", user.Username)
		c.Set("user_role", user.Role)
		c.Next()
	}
}

func validateToken(token string) (*UserInfo, error) {
	req, err := http.NewRequest("GET", AccountBaseURL+"/oauth/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, &authError{"token 校验失败"}
	}

	var result struct {
		Sub      string `json:"sub"`
		Username string `json:"username"`
		Email    string `json:"email"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &UserInfo{
		Sub:      result.Sub,
		Username: result.Username,
		Email:    result.Email,
		Role:     result.Role,
	}, nil
}

type authError struct{ msg string }

func (e *authError) Error() string { return e.msg }
