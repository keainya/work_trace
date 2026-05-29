package main

import (
	"fmt"

	"github.com/keainya/work_trace/object"
	"github.com/keainya/work_trace/router"
)

func main() {
	if object.Database == nil {
		fmt.Println("database error")
	}
	router.InitRouter(webFS).Run()
}
