package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/keainya/work_trace/object"
	"github.com/keainya/work_trace/router"
	"github.com/keainya/work_trace/utils"
)

func main() {
	// 写入 PID 文件，方便脚本管理进程
	pidPath, err := utils.WritePidFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, "warn: write pid file:", err)
	} else {
		defer utils.RemovePidFile()
		fmt.Println("pid file:", pidPath)
	}

	if object.Database == nil {
		fmt.Println("database error")
	}
	router.InitRouter(webFS).Run(":" + strconv.Itoa(utils.Config.Port))
}
