package main

import (
	"fmt"

	"github.com/keainya/service_temp/object"
	"github.com/keainya/service_temp/router"
)

func main() {
	if object.Database == nil {
		fmt.Println("database error")
	}
	router.InitRouter(webFS).Run()
}
