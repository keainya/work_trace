package main

import (
	"fmt"
	"strconv"

	"github.com/keainya/work_trace/object"
	"github.com/keainya/work_trace/router"
	"github.com/keainya/work_trace/utils"
)

func main() {
	if object.Database == nil {
		fmt.Println("database error")
	}
	router.InitRouter(webFS).Run(":" + strconv.Itoa(utils.Config.Port))
}
